/**
 * Allowlist guard for the CLI arm's Bash tool. Runs as a PreToolUse hook, so
 * it applies regardless of permission mode.
 *
 * Allowed: pipelines and `&&`/`||`/`;` chains of allowlisted commands;
 * command and process substitution (`$(...)`, backticks, `<(...)`), whose
 * inner commands are checked recursively; heredocs and here-strings; and
 * file redirection to relative paths inside the sandbox working directory
 * (plus /dev/null and fd duplication like 2>&1).
 *
 * Rejected: any command not on the allowlist, backgrounding, variable
 * assignments, and paths that leave the working directory (absolute paths,
 * `~`, or `..`).
 */
export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

const MAX_DEPTH = 4;

/** Shell keywords that may prefix a command (`do tsk ...`, `if tsk ...`). */
const PREFIX_KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "while",
  "until",
  "do",
  "!",
  "{",
]);
/** Keywords that form a whole segment on their own. */
const CLOSING_KEYWORDS = new Set(["done", "fi", "}", "break", "continue"]);

/**
 * Variables an assignment may not set: they would change how commands are
 * resolved, where the CLI connects, or what the shell loads.
 */
const PROTECTED_VARIABLES =
  /^(?:PATH|HOME|SHELL|ENV|BASH_ENV|IFS|CDPATH|PROMPT_COMMAND|TYPESENSE_\w*|LD_\w*|DYLD_\w*)$/;

export type GuardOptions = {
  /**
   * Absolute directories that count as inside the sandbox (the session's
   * working directory, in every spelling, e.g. /var and /private/var).
   */
  roots?: readonly string[];
};

type Parsed = { segments: string[][] } | { error: string };

/** True for a path that stays inside the working directory. */
function isSandboxPath(path: string, options: GuardOptions): boolean {
  if (path === "/dev/null") return true;
  if (path.length === 0 || path.startsWith("~")) return false;
  if (path.split("/").includes("..")) return false;
  if (!path.startsWith("/")) return true;
  return (options.roots ?? []).some(
    (root) => path === root || path.startsWith(`${root.replace(/\/$/, "")}/`),
  );
}

/** Index of the `)` closing a `(` opened just before `start`, respecting quotes. */
function findClosingParen(command: string, start: number): number {
  let depth = 1;
  let quote: "'" | '"' | null = null;
  for (let i = start; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === "\\" && quote === '"') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "\\") i++;
    else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return i;
  }
  return -1;
}

function parse(
  command: string,
  allowed: readonly string[],
  depth: number,
  options: GuardOptions,
): Parsed {
  if (depth > MAX_DEPTH) return { error: "too deeply nested substitution" };
  const segments: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;
  const heredocs: string[] = [];

  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  const nested = (inner: string): string | undefined => {
    const result = checkShellCommand(inner, allowed, options, depth + 1);
    return result.allowed ? undefined : result.reason;
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i] as string;
    const next = command[i + 1];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    // Command substitution is live outside quotes and inside double quotes.
    if (char === "$" && next === "(") {
      const end = findClosingParen(command, i + 2);
      if (end < 0) return { error: "unterminated $(...)" };
      const problem = nested(command.slice(i + 2, end));
      if (problem) return { error: problem };
      word += "$(…)";
      inWord = true;
      i = end;
      continue;
    }
    if (char === "`") {
      const end = command.indexOf("`", i + 1);
      if (end < 0) return { error: "unterminated backtick" };
      const problem = nested(command.slice(i + 1, end));
      if (problem) return { error: problem };
      word += "`…`";
      inWord = true;
      i = end;
      continue;
    }
    if (quote === '"') {
      if (char === "\\" && next !== undefined) {
        word += next;
        i++;
      } else if (char === '"') quote = null;
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
      continue;
    }
    if (char === "\\" && next !== undefined) {
      if (next !== "\n") {
        word += next;
        inWord = true;
      }
      i++;
      continue;
    }
    if (char === "#" && !inWord) {
      while (i < command.length && command[i] !== "\n") i++;
      i--;
      continue;
    }
    if (char === " " || char === "\t") {
      endWord();
      continue;
    }
    if (char === "\n") {
      endSegment();
      // Skip heredoc bodies that start after this line.
      for (const delimiter of heredocs.splice(0)) {
        let lineStart = i + 1;
        for (;;) {
          const lineEnd = command.indexOf("\n", lineStart);
          const line = command.slice(
            lineStart,
            lineEnd < 0 ? undefined : lineEnd,
          );
          if (line.replace(/^\t+/, "") === delimiter) {
            i = lineEnd < 0 ? command.length : lineEnd;
            break;
          }
          if (lineEnd < 0)
            return { error: `unterminated heredoc (${delimiter})` };
          lineStart = lineEnd + 1;
        }
      }
      continue;
    }
    if (char === ";") {
      endSegment();
      continue;
    }
    if (char === "|") {
      if (next === "|") i++;
      endSegment();
      continue;
    }
    if (char === "&") {
      if (next === "&") {
        i++;
        endSegment();
        continue;
      }
      if (next === ">") {
        // &> / &>> redirect: handled below on the next character.
        endWord();
        word = "&";
        inWord = true;
        continue;
      }
      return { error: "background execution (&)" };
    }
    if ((char === "<" || char === ">") && next === "(") {
      const end = findClosingParen(command, i + 2);
      if (end < 0) return { error: "unterminated process substitution" };
      const problem = nested(command.slice(i + 2, end));
      if (problem) return { error: problem };
      endWord();
      words.push("<(…)");
      i = end;
      continue;
    }
    if (char === "<" && next === "<") {
      // Here-string (<<<) or heredoc (<<, <<-).
      endWord();
      let j = i + 2;
      if (command[j] === "<") {
        i = j; // here-string: the following word is data
        continue;
      }
      if (command[j] === "-") j++;
      while (command[j] === " ") j++;
      let delimiter = "";
      while (j < command.length && !/[\s;|&<>]/.test(command[j] as string)) {
        delimiter += command[j];
        j++;
      }
      delimiter = delimiter.replace(/^['"]|['"]$/g, "");
      if (!delimiter) return { error: "heredoc without delimiter" };
      heredocs.push(delimiter);
      i = j - 1;
      continue;
    }
    if (char === "<" || char === ">") {
      // Redirection: an optional fd prefix already in `word`, the operator,
      // then a target (an fd like &1, or a path).
      const fdPrefix = inWord && /^[0-9&]$/.test(word);
      if (!fdPrefix) endWord();
      word = "";
      inWord = false;
      let j = i + 1;
      if (command[j] === ">" || command[j] === "|") j++;
      if (command[j] === "&") {
        j++;
        let fd = "";
        while (/[0-9-]/.test(command[j] ?? "")) fd += command[j++];
        if (!fd) return { error: "redirection to an unnamed fd" };
        i = j - 1;
        continue;
      }
      while (command[j] === " ") j++;
      let target = "";
      let targetQuote: "'" | '"' | null = null;
      while (j < command.length) {
        const c = command[j] as string;
        if (targetQuote) {
          if (c === targetQuote) targetQuote = null;
          else target += c;
        } else if (c === "'" || c === '"') targetQuote = c;
        else if (/[\s|;&<>()]/.test(c)) break;
        else target += c;
        j++;
      }
      if (!isSandboxPath(target, options)) {
        return {
          error: `redirection to "${target || "(nothing)"}" (only relative paths inside the working directory)`,
        };
      }
      i = j - 1;
      continue;
    }
    word += char;
    inWord = true;
  }
  if (quote) return { error: "unterminated quote" };
  if (heredocs.length > 0)
    return { error: `unterminated heredoc (${heredocs[0]})` };
  endSegment();
  return { segments };
}

export function checkShellCommand(
  command: string,
  allowedCommands: readonly string[],
  options: GuardOptions = {},
  depth = 0,
): GuardResult {
  const allowedList = allowedCommands.join(", ");
  const parsed = parse(command, allowedCommands, depth, options);
  if ("error" in parsed) {
    return {
      allowed: false,
      reason: parsed.error.startsWith("Blocked by sandbox")
        ? parsed.error
        : `Blocked by sandbox: ${parsed.error} is not allowed. Only these commands may run: ${allowedList}. Files may be read and written only inside the working directory.`,
    };
  }
  if (parsed.segments.length === 0) {
    return { allowed: false, reason: "Blocked by sandbox: empty command." };
  }
  for (const words of parsed.segments) {
    // Control flow: strip leading keywords; `for VAR in ...` and closing
    // keywords run no program, but their words are still path-checked.
    let start = 0;
    while (
      start < words.length &&
      PREFIX_KEYWORDS.has(words[start] as string)
    ) {
      start++;
    }
    const segment = words.slice(start);
    const head = segment[0];
    if (!head || CLOSING_KEYWORDS.has(head)) continue;
    const isFor = head === "for";
    // Leading VAR=value words: shell variables, or env for one command.
    let firstCommand = isFor ? 1 : 0;
    if (!isFor) {
      while (firstCommand < segment.length) {
        const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(
          segment[firstCommand] as string,
        );
        if (!assignment) break;
        if (PROTECTED_VARIABLES.test(assignment[1] as string)) {
          return {
            allowed: false,
            reason: `Blocked by sandbox: setting ${assignment[1]} is not allowed.`,
          };
        }
        firstCommand++;
      }
    }
    const [program, ...args] = isFor
      ? ["for", ...segment.slice(1)]
      : segment.slice(firstCommand);
    if (!program) continue;
    if (!isFor && !allowedCommands.includes(program)) {
      return {
        allowed: false,
        reason: `Blocked by sandbox: "${program}" is not available. Only these commands may run: ${allowedList}.`,
      };
    }
    for (const arg of args) {
      const pathLike =
        arg.startsWith("/") || arg.startsWith("~") || arg.includes("../");
      if (pathLike && !isSandboxPath(arg, options)) {
        return {
          allowed: false,
          reason: `Blocked by sandbox: file paths outside the working directory ("${arg}") are not allowed.`,
        };
      }
    }
  }
  return { allowed: true };
}
