/**
 * Allowlist guard for the CLI arm's Bash tool. Runs as a PreToolUse hook, so
 * it applies regardless of permission mode.
 *
 * Accepts pipelines and `&&`/`||`/`;` chains whose every command is on the
 * allowlist. Rejects command substitution, process substitution, heredocs,
 * file redirection (except to /dev/null and 2>&1), backgrounding, variable
 * assignments, and arguments that reach outside the sandbox directory.
 */
export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

const ALLOWED_REDIRECTS = /^(?:[012]?>&[12]|[012&]?>>?\/dev\/null)$/;

type Segment = string[];

function tokenize(command: string): Segment[] | { error: string } {
  const segments: Segment[] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;

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

  for (let i = 0; i < command.length; i++) {
    const char = command[i] as string;
    const next = command[i + 1];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (char === "`") return { error: "backtick command substitution" };
    if (char === "$" && next === "(") return { error: "$(...) substitution" };
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
      if (next !== "\n") word += next;
      inWord = inWord || next !== "\n";
      i++;
      continue;
    }
    if (char === "#" && !inWord) {
      // Comment to end of line.
      while (i < command.length && command[i] !== "\n") i++;
      endSegment();
      continue;
    }
    if (char === " " || char === "\t") {
      endWord();
      continue;
    }
    if (char === "\n" || char === ";") {
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
        // &>/dev/null style redirect: let the redirect check below see it.
        word += char;
        inWord = true;
        continue;
      }
      if (command[i - 1] === ">") {
        word += char;
        continue;
      }
      return { error: "background execution (&)" };
    }
    if (char === "<" || char === ">") {
      if (char === "<" && (next === "<" || next === "(")) {
        return { error: "heredoc or process substitution" };
      }
      if (char === ">" && next === "(") {
        return { error: "process substitution" };
      }
      // Capture a full redirect token such as 2>&1, >/dev/null, 2>>/dev/null.
      let token = inWord && /^[012&]$/.test(word) ? word : "";
      if (!token) endWord();
      word = "";
      inWord = false;
      let j = i;
      while (j < command.length && /[<>&0-9]/.test(command[j] as string)) {
        token += command[j];
        j++;
      }
      while (command[j] === " ") j++;
      let target = "";
      if (!/&\d$/.test(token)) {
        while (j < command.length && !/[\s|;&]/.test(command[j] as string)) {
          target += command[j];
          j++;
        }
      }
      const full = `${token}${target}`;
      if (!ALLOWED_REDIRECTS.test(full)) {
        return { error: `redirection "${full}"` };
      }
      i = j - 1;
      continue;
    }
    word += char;
    inWord = true;
  }
  if (quote) return { error: "unterminated quote" };
  endSegment();
  return segments;
}

export function checkShellCommand(
  command: string,
  allowedCommands: readonly string[],
): GuardResult {
  const allowedList = allowedCommands.join(", ");
  const parsed = tokenize(command);
  if ("error" in parsed) {
    return {
      allowed: false,
      reason: `Blocked by sandbox: ${parsed.error} is not allowed. Only these commands may run: ${allowedList}. Pass JSON inline with --input '<json>'.`,
    };
  }
  if (parsed.length === 0) {
    return { allowed: false, reason: "Blocked by sandbox: empty command." };
  }
  for (const segment of parsed) {
    const [program, ...args] = segment;
    if (!program) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(program)) {
      return {
        allowed: false,
        reason: `Blocked by sandbox: environment assignments are not allowed. Only these commands may run: ${allowedList}.`,
      };
    }
    if (!allowedCommands.includes(program)) {
      return {
        allowed: false,
        reason: `Blocked by sandbox: "${program}" is not available. Only these commands may run: ${allowedList}.`,
      };
    }
    for (const arg of args) {
      if (
        (arg.startsWith("/") && arg !== "/dev/null") ||
        arg.startsWith("~") ||
        arg.includes("../")
      ) {
        return {
          allowed: false,
          reason: `Blocked by sandbox: file paths outside the working directory ("${arg}") are not allowed.`,
        };
      }
    }
  }
  return { allowed: true };
}
