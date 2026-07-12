# @typesensekit/cli

CLI for Typesense API operations, profile management, and agent skill snippets.

```sh
pnpm add -g @typesensekit/cli
# Secure interactive prompt
tsk profile add local --url http://localhost:8108

# Non-interactive stdin (avoids argv and shell history)
printf '%s' "$TYPESENSE_API_KEY" | tsk profile add ci --url https://typesense.example.com --api-key-stdin

# macOS Keychain-backed profile
tsk profile add production --url https://typesense.example.com --keychain

tsk profile test production
tsk profile export production > profile.json       # omits plaintext keys
tsk profile export production --reveal > backup.json
tsk profile import backup.json
```

Operation results use readable tables where possible. Pass `--json` for stable,
redacted JSON output in scripts.

Destructive operations prompt before execution. Pass `--yes` only for deliberate
non-interactive automation.

Every operation supports `--schema` and `--examples`. Enable shell completion with:

```sh
source <(tsk completion zsh)              # zsh
source <(tsk completion bash)             # bash
tsk completion fish | source              # fish
```

Discover operations and generate integration snippets:

```sh
tsk collections.list --input '{}'
tsk skills mcp
```

See the root README for operation coverage and development docs.
