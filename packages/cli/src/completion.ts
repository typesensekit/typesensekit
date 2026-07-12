import { operations } from "@typesensekit/core";

export type CompletionShell = "bash" | "zsh" | "fish";

const TOP_LEVEL = [
  "profile",
  "operations",
  "skills",
  "completion",
  ...operations.map((operation) => operation.name),
];
const PROFILE = [
  "add",
  "list",
  "use",
  "show",
  "remove",
  "rename",
  "test",
  "export",
  "import",
];

export function renderCompletion(shell: CompletionShell): string {
  const top = TOP_LEVEL.join(" ");
  const profile = PROFILE.join(" ");
  if (shell === "bash") {
    return `_tsk_completion() {
  local words="${top}"
  if [[ "\${COMP_WORDS[1]}" == "profile" ]]; then words="${profile}"; fi
  COMPREPLY=( $(compgen -W "$words" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F _tsk_completion tsk typesensekit`;
  }
  if (shell === "zsh") {
    return `#compdef tsk typesensekit
_tsk_completion() {
  local -a commands
  commands=(${top})
  if [[ "$words[2]" == "profile" ]]; then commands=(${profile}); fi
  _describe 'command' commands
}
compdef _tsk_completion tsk typesensekit`;
  }
  return `complete -c tsk -f -n 'not __fish_seen_subcommand_from profile' -a '${top}'
complete -c typesensekit -f -n 'not __fish_seen_subcommand_from profile' -a '${top}'
complete -c tsk -f -n '__fish_seen_subcommand_from profile' -a '${profile}'
complete -c typesensekit -f -n '__fish_seen_subcommand_from profile' -a '${profile}'`;
}
