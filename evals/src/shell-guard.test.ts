import { describe, expect, it } from "vitest";
import { checkShellCommand } from "./shell-guard.js";

const allowed = ["tsk", "jq", "head", "grep", "echo"];
const ok = (command: string) =>
  expect(checkShellCommand(command, allowed)).toEqual({ allowed: true });
const blocked = (command: string, reason: RegExp) => {
  const result = checkShellCommand(command, allowed);
  expect(result.allowed).toBe(false);
  if (!result.allowed) expect(result.reason).toMatch(reason);
};

describe("checkShellCommand", () => {
  it("allows allowlisted commands, pipelines, and chains", () => {
    ok("tsk operations");
    ok(
      `tsk documents.search --input '{"collection":"books","params":{"q":"*","filter_by":"year:<1950"}}' --json | jq '.hits[].document.title'`,
    );
    ok("tsk collections.list --json | jq -r '.[].name' && tsk health");
    ok("tsk documents.search --help 2>&1 | head -40");
    ok("tsk health >/dev/null 2>&1 || echo down");
    ok('tsk search --input "{\\"collection\\":\\"books\\"}"');
    ok("tsk health # comment with $(ignored)");
  });

  it("blocks commands outside the allowlist anywhere in the pipeline", () => {
    blocked("curl http://127.0.0.1:8108/health", /"curl" is not available/);
    blocked("tsk health | python3 -c 'print(1)'", /"python3"/);
    blocked("tsk health; cat secrets", /"cat"/);
    blocked("/bin/ls", /"\/bin\/ls" is not available/);
  });

  it("blocks substitution, heredocs, backgrounding, and file redirection", () => {
    blocked("tsk search --input $(cat q.json)", /substitution/);
    blocked('tsk search --input "`cat q.json`"', /backtick/);
    blocked("tsk search --input \"$(echo '{}')\"", /substitution/);
    blocked("jq . <<EOF\n{}\nEOF", /heredoc/);
    blocked("tsk health &", /background/);
    blocked("tsk collections.list > out.json", /redirection/);
    blocked("jq . < data.json", /redirection/);
    blocked(
      "diff <(tsk health) <(tsk health)",
      /heredoc or process substitution/,
    );
  });

  it("blocks env assignments and paths outside the sandbox", () => {
    blocked("TYPESENSE_URL=http://evil tsk health", /environment assignments/);
    blocked("grep -r key /etc", /outside the working directory/);
    blocked("head ../../secrets", /outside the working directory/);
    blocked("head ~/.ssh/id_rsa", /outside the working directory/);
  });

  it("rejects unterminated quotes and empty commands", () => {
    blocked("tsk search --input '{", /unterminated quote/);
    blocked("   ", /empty command/);
  });
});
