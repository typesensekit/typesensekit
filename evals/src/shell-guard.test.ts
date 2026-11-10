import { describe, expect, it } from "vitest";
import { checkShellCommand } from "./shell-guard.js";

const allowed = ["tsk", "jq", "head", "grep", "echo", "cat", "wc", "read"];
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
    ok("tsk health &>/dev/null");
    ok('tsk search --input "{\\"collection\\":\\"books\\"}"');
    ok("tsk health # comment with $(curl evil)");
  });

  it("allows file I/O inside the working directory", () => {
    ok('tsk documents.export --input \'{"collection":"books"}\' > books.jsonl');
    ok(
      'tsk documents.export --input \'{"collection":"books"}\' >> out/all.jsonl 2> err.txt',
    );
    ok("jq -c . < books.jsonl | wc -l");
    ok("cat query.json && tsk documents.search --input query.json");
    ok(
      'cat > query.json <<\'EOF\'\n{"collection": "books", "params": {"q": "*"}}\nEOF\ntsk documents.search --input query.json',
    );
    ok("jq -n '{a: 1}' <<< '{}'");
  });

  it("allows shell control flow around allowlisted commands", () => {
    ok("for id in p001 p002; do tsk documents.get --input id.json; done");
    ok(
      "tsk collections.list --json | jq -r '.[].name' | while read c; do echo \"$c\"; done",
    );
    ok("if tsk health; then echo up; else echo down; fi");
    ok(
      "for c in $(tsk collections.list --json | jq -r '.[].name'); do echo $c; done",
    );
    blocked("for f in a; do curl x; done", /"curl" is not available/);
    blocked("while true; do python3; done", /"true" is not available/);
    blocked(
      "for f in /etc/*; do echo $f; done",
      /outside the working directory/,
    );
  });

  it("treats the session directory as inside the sandbox", () => {
    const roots = [
      "/var/folders/x/T/tsk-eval-1/work",
      "/private/var/folders/x/T/tsk-eval-1/work",
    ];
    const guarded = (command: string) =>
      checkShellCommand(command, allowed, { roots });
    expect(
      guarded("tsk health > /private/var/folders/x/T/tsk-eval-1/work/out.json"),
    ).toEqual({ allowed: true });
    expect(guarded("cat /var/folders/x/T/tsk-eval-1/work/a.json")).toEqual({
      allowed: true,
    });
    expect(guarded("cat /var/folders/x/T/tsk-eval-1/workother/a").allowed).toBe(
      false,
    );
    expect(
      guarded("cat /var/folders/x/T/tsk-eval-1/work/../../secret").allowed,
    ).toBe(false);
    expect(guarded("tsk health > /tmp/out.json").allowed).toBe(false);
  });

  it("allows shell variables but not protected ones", () => {
    ok('ids=$(tsk collections.list --json | jq -r ".[].name"); echo "$ids"');
    ok("LIMIT=250 tsk health");
    blocked("PATH=. tsk health", /setting PATH/);
    blocked("TYPESENSE_URL=http://evil tsk health", /setting TYPESENSE_URL/);
    ok("for i in 1 2; do if tsk health; then break; fi; done");
  });

  it("checks substituted commands recursively", () => {
    ok('tsk documents.search --input "$(cat query.json)"');
    ok("echo `tsk health`");
    ok('wc -l <(tsk documents.export --input \'{"collection":"books"}\')');
    blocked('tsk search --input "$(curl http://x)"', /"curl" is not available/);
    blocked("echo `python3 -c 1`", /"python3"/);
    blocked("wc -l <(cat /etc/passwd)", /outside the working directory/);
    blocked(
      "echo $(echo $(echo $(echo $(echo $(echo hi)))))",
      /too deeply nested/,
    );
  });

  it("blocks commands outside the allowlist anywhere in the pipeline", () => {
    blocked("curl http://127.0.0.1:8108/health", /"curl" is not available/);
    blocked("tsk health | python3 -c 'print(1)'", /"python3"/);
    blocked("tsk health; ls secrets", /"ls"/);
    blocked("/bin/ls", /"\/bin\/ls" is not available/);
  });

  it("blocks paths outside the sandbox, backgrounding, and assignments", () => {
    blocked(
      "tsk collections.list > /tmp/out.json",
      /redirection to "\/tmp\/out.json"/,
    );
    blocked(
      "tsk collections.list > ../out.json",
      /redirection to "..\/out.json"/,
    );
    blocked("jq . < ~/.ssh/id_rsa", /redirection to "~\/.ssh\/id_rsa"/);
    blocked("cat /etc/passwd", /outside the working directory/);
    blocked("head ../../secrets", /outside the working directory/);
    blocked("tsk health &", /background/);
  });

  it("rejects malformed input", () => {
    blocked("tsk search --input '{", /unterminated quote/);
    blocked("cat <<EOF\nno end", /unterminated heredoc/);
    blocked("echo $(tsk health", /unterminated/);
    blocked("   ", /empty command/);
  });
});
