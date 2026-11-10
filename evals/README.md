# TypesenseKit agent evals

A repeatable task-success benchmark for how well an AI agent gets real
Typesense work done through an interface: the TypesenseKit MCP server, the
`tsk` CLI, or any other Typesense MCP server you plug in. The same 50 tasks and
graders run against every interface, so results compare directly.

**On demand only.** Runs call the Claude API and cost money. This workspace is
private, is not part of `pnpm check`, and is not run in CI.

## Quick start

```sh
pnpm install
pnpm build                       # the arms run packages/{mcp,cli}/dist

# Free: validates datasets, oracles, graders, reference solutions, and the
# agent wiring of every interface. Needs Docker, no API key.
pnpm eval --dry-run

# Free: tool-surface stats per interface (tool count, definition size, ...).
pnpm eval --inspect

# Smoke run: a few tasks per interface on Haiku (see Auth below).
pnpm eval -i both -m claude-haiku-5-5 -t discovery.count-books,search.find-by-name,facets.top-brand,debug.facet-category,write.create-alias

# Full benchmark: 50 tasks × 2 interfaces × 3 models, 3 repetitions, 4 parallel clusters.
pnpm eval -i both -r 3 -c 4 --yes
```

Each run writes `evals/results/<run-id>/` (gitignored):

| File | Contents |
| --- | --- |
| `summary.md`, `summary.json` | Pass rate per interface × model × category (mean ± sd over repetitions), cost, tokens, tool metrics, most common failure modes and tool errors, op usage, per-task results |
| `attempts.jsonl` | One metrics record per attempt |
| `transcripts/<interface>__<model>__<task>__r<n>.jsonl` | Raw Agent SDK messages, plus `eval_meta` / `eval_grade` / `eval_stderr` lines |
| `meta.json` | Run settings and skipped interface/task pairs |

`pnpm eval --report evals/results/<run-id>` rebuilds the summary from
`attempts.jsonl`, for example after changing the report code.

## Auth

`--auth auto` (the default) uses the first of these that is set. Your
`ANTHROPIC_BASE_URL` is passed along too, if set.

1. `ANTHROPIC_API_KEY`
2. `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token` (uses your Claude plan)
3. `ANTHROPIC_AUTH_TOKEN` (bearer token, e.g. for a gateway)

These are passed as env vars, so sessions keep their isolated temp HOME.

`--auth claude-login` reuses the Claude Code login in your OS keychain
(`claude auth status`). Sessions then run with your real HOME, but filesystem
settings, CLAUDE.md, skills, and your MCP servers are still not loaded, and
`tsk` always gets a private HOME. Force a source with `--auth api-key`,
`oauth-token`, or `auth-token`.

Reported costs are list-price equivalents computed by Claude Code. With a
subscription token, usage counts against your plan's limits instead.

## Options

```
-i, --interface   mcp | cli | both | all | comma-separated names   (default both)
-m, --model       comma-separated ids (default claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5)
-t, --tasks       ids, prefixes (search. or debug*), categories, difficulties,
                  modes (read-only, full-access); !term excludes
-r, --reps        repetitions per task (default 1)
-c, --concurrency parallel workers, each with its own Docker cluster (default 1)
--max-turns 25  --max-budget 1.00 (USD per attempt)  --timeout 300 (s)  --effort <level>
--auth auto | api-key | oauth-token | auth-token | claude-login
--typesense-url / --typesense-api-key / --allow-wipe   use an existing (wiped!) cluster
--dry-run  --inspect  --list  --report <dir>  -y/--yes  --results <dir>
```

Runs over 30 attempts need `--yes`. The plan line prints the attempt count and
the worst case (`attempts × --max-budget`) before anything starts.

## How it works

1. **Cluster.** Each worker starts a disposable `typesense/typesense:30.2`
   container on a random localhost port (`--rm`, labelled
   `typesensekit-evals=1`, removed on exit or Ctrl-C).
2. **Reset and seed before every attempt.** Using plain HTTP, not an interface
   under test, the harness deletes all collections, aliases, synonym sets,
   curation sets, presets, stopwords, API keys, and analytics rules. It then
   seeds `datasets/fixtures.json` and the JSONL files and checks the document
   counts.
3. **Agent.** The [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk)
   runs one session per attempt, in isolation:
   - a fresh temp `HOME`, `CLAUDE_CONFIG_DIR`, and cwd
   - `settingSources: []`, no skills, `strictMcpConfig`, `persistSession: false`
   - a neutral system prompt that asks for a final `FINAL ANSWER: <value>` line

   Your own Claude settings, CLAUDE.md files, and MCP servers are never
   loaded. Credentials come only from the env vars described under Auth,
   unless you pass `--auth claude-login`.
   - **MCP arms** see only the server's tools, plus `ListMcpResourcesTool` /
     `ReadMcpResourceTool` when `allowResources` is set. They have no built-in
     file or shell tools. `alwaysLoadTools` (default true) disables tool-search
     deferral, so the full tool-definition cost is part of the measurement.
   - **CLI arms** see only `Bash`. A `PreToolUse` hook that cannot be bypassed
     (`src/shell-guard.ts`) allows only `allowedCommands` (`tsk`, `jq`, `head`,
     `grep`, `cat`, …). Command substitution, process substitution, heredocs,
     and file redirection are allowed, with substituted commands checked
     recursively. Files can be read and written only inside the session's
     temp working directory. Env assignments, backgrounding, and paths that
     leave the working directory (absolute, `~`, `..`) are blocked. `tsk` is a PATH shim to
     `packages/cli/dist/cli.js`, configured through `TYPESENSE_URL` /
     `TYPESENSE_API_KEY`. The agent has to discover usage itself with
     `tsk operations`, `--help`, `--schema`, and `--examples`.
4. **Grading.**
   - Answer tasks take the last `FINAL ANSWER:` line and compare it, after
     normalization, as exact text, a number within a tolerance, an unordered
     set, or an ordered list.
   - Expected values come from **oracles** that query the freshly seeded
     cluster before the agent starts. Oracles throw on ties, so ambiguous
     tasks fail the dry run instead of grading randomly.
   - State tasks (debugging and write, full-access) inspect the cluster
     afterwards with direct HTTP. The checks are behavioral (does `couch` now
     find every sofa? does faceting by category work, with no articles
     lost?), so any valid fix passes.

### Modes

| Mode | Tasks | TypesenseKit MCP | TypesenseKit CLI |
| --- | --- | --- | --- |
| `read-only` | 36 answer tasks | default server (`TYPESENSEKIT_READ_ONLY` unset): 45 tools | full CLI (it has no read-only switch); state is reset after every attempt anyway |
| `full-access` | 6 debugging + 8 write tasks | `TYPESENSEKIT_READ_ONLY=false`: 95 tools | full CLI |

An interface that lacks a mode skips that mode's tasks; skips are listed in
the report.

### Metrics per attempt

| Metric | Definition |
| --- | --- |
| `pass`, `failureMode` | `passed`, `wrong_answer`, `no_final_answer`, `state_not_reached`, `max_turns`, `budget_exceeded`, `timeout`, `agent_error` |
| `turns` | `num_turns` from the SDK result |
| `toolsAvailable` | tools in the session's init message |
| `toolCalls`, `discoveryCalls` | all calls; CLI calls that only ran `operations`/`--help`/`--schema`/`--examples` |
| `toolErrors` and `errorsByKind` | `invalid_args` (schema, JSON, or flag validation before reaching Typesense), `typesense` (cluster rejected the request), `unknown_tool` (unknown or unavailable op, which signals a wrong tool choice), `denied` (sandbox), `other`. Regexes in `src/metrics.ts`; interfaces can add their own via `errorPatterns`. |
| `duplicateCalls` | the same tool with identical arguments called again |
| `unknownOpCalls` | calls that referenced an operation the interface does not have, e.g. a guessed `tsk collections retrieve` or `tsk alias --help`. CLI ops are checked against the `opsListCommand` output (`tsk operations`), loaded once per run. Errors from these calls count as `unknown_tool`. |
| `alternateToolMixes` | the attempt used more than one op from an interface's `toolGroups`, e.g. both `search` and `documents.search` |
| `opsUsed` | op histogram. Names are canonicalized (`documents.search` becomes `documents_search`) because Claude Code renames dotted MCP tools that way. |
| tokens, `costUsd`, `wallMs` | from the SDK result (`usage`, `total_cost_usd`) and wall clock |

Pass rates are reported as the mean of the per-repetition pass rates, with
their sample variance and standard deviation.

## Datasets

All names are fictional, so an agent can't answer from memory. Regenerate them
deterministically with `pnpm --filter @typesensekit/evals exec tsx scripts/generate-datasets.ts`,
then rerun `--dry-run`.

- `products.jsonl` (3,034): 54 hand-checked products (p001–p054) plus 2,980
  generated ones (p1001+), with brand, category, price, rating, stock, and
  tags facets. Linked to the `furniture-synonyms` synonym set (lamp↔light; no
  couch↔sofa) and the `product-curations` curation set, which hides p016 for
  "headphones" and pins p010 for "sofa". 16 brands with distinct sizes: the
  six smallest, including "Fox & Finch", fall outside Typesense's default 10
  facet values.
- `books.jsonl` (50): author, genre, year, pages, and language. b050 is a
  deliberate duplicate of b012.
- `support_articles.jsonl` (24): **deliberately misconfigured.**
  - `category` is not facetable.
  - `product_area` is not indexed.
  - `views` is not sortable.
  - The `support_search` preset only queries `title`, but "refund" appears
    only in bodies.
  - The linked synonym set has no login↔sign in mapping.
- `fixtures.json`: schemas, synonym sets, curation sets, presets, stopwords,
  and aliases.

### Trap tasks

These tasks have a plausible wrong answer that comes from Typesense defaults.
An agent passes only if it notices the default and works around it.

| Task | Naive approach | Why it's wrong |
| --- | --- | --- |
| `search.cheapest-sofa` | search `sofa`, sort by price | a curation rule pins p010 first |
| `search.lamp-name-count` | count hits for `lamp` | the synonym set also matches lights |
| `search.list-many-ids` | read the first page of hits | 12 matches; only 10 are returned per page by default |
| `search.fox-and-finch-in-stock` | `filter_by: brand:=Fox & Finch` | `&` must be escaped; the brand is outside the default facet values |
| `facets.fewest-products-brand` | `facet_by: brand` | only the top 10 brands come back by default |
| `facets.office-price-sum`, `facets.most-reviewed-per-category` | dump and add up | 3k products; needs facet stats or `group_by` |

Prompts use the words a user would ("our catalog", "the library", "the help
center", "saved search") rather than collection or field names, so discovery
is part of every task. Debugging tasks describe a symptom only ("sorting
articles by most viewed fails; fix it") and are graded on whether the broken
request now works with no data lost.

## Cost expectations

These are rough estimates from list prices, not measurements. Your first run
reports the real numbers.

Assume an attempt takes about 5 turns, with about 75k input tokens in total
(system prompt + tool definitions + growing context, mostly cache reads after
the first turn) and about 2k output tokens. At most, before caching discounts,
that comes to:

| Model | Input / output per MTok | ≈ per attempt (uncached) | Full run: 50 tasks × 2 interfaces = 100 attempts |
| --- | --- | --- | --- |
| claude-haiku-5-5 | $0.10 / $0.50 | ~$0.01 | ~$1 |
| claude-sonnet-5-5 | $2 / $10 | ~$0.17 | ~$16 |
| claude-opus-5-5 | $4 / $20 | ~$0.34 | ~$33 |

All three models at 1 repetition is about $50 at the upper end. Prompt caching
usually cuts the input share substantially. Multiply by `--reps`.
`--max-budget` caps each attempt; the default is $1. Full-access MCP sessions
carry about 2.5× the tool-definition tokens of read-only ones.

## Adding an interface

An interface is one JSON file in `interfaces/`. Tasks and graders never
reference an interface. `interfaces/examples/` has templates for a stdio MCP
server and a remote HTTP MCP server.

```jsonc
{
  "name": "acme-typesense-mcp",          // used with -i
  "kind": "mcp",                         // or "cli"
  "server": { "type": "stdio", "command": "npx", "args": ["-y", "acme-mcp"],
              "env": { "TYPESENSE_HOST": "${TYPESENSE_HOST}", "TYPESENSE_API_KEY": "${TYPESENSE_API_KEY}" } },
  // or: { "type": "http", "url": "${env:ACME_URL}", "headers": { "Authorization": "Bearer ${env:ACME_TOKEN}" } }
  "modes": { "read-only": { "env": {} }, "full-access": { "env": { "ACME_WRITE": "1" } } },
  "alwaysLoadTools": true,
  "toolGroups": [["search", "search_documents"]],   // optional
  "errorPatterns": { "invalid_args": "ValidationError" }, // optional
  "promptHint": "…",                     // optional, appended to the system prompt
  "requires": ["${REPO_ROOT}/…"]         // optional build outputs to check
}
```

- **Template variables:** `${TYPESENSE_URL}`, `${TYPESENSE_API_KEY}`,
  `${TYPESENSE_HOST}`, `${TYPESENSE_PORT}`, `${TYPESENSE_PROTOCOL}`,
  `${REPO_ROOT}`, `${EVALS_ROOT}`, `${NODE}`, and `${env:NAME}` for secrets
  from your shell.
- **Modes:** leave out a mode the server doesn't support; its tasks are skipped.
- **Hosted servers** (e.g. Typesense Cloud's) can't reach the local Docker
  cluster. Point the run at a disposable cluster that the hosted server is also
  connected to: `--typesense-url … --typesense-api-key … --allow-wipe`. That
  cluster is wiped before every attempt. Use `-c 1`.
- **CLI interfaces** need `commands` (PATH shims), `allowedCommands`, `env`,
  and optionally `opPattern` / `discoveryPattern` for op metrics. See
  `typesensekit-cli.json`.

Run `pnpm eval -i <name> --dry-run` to check the wiring. It inspects the tools,
starts a real Agent SDK session with an invalid key to read the init message,
and confirms the server reports `connected`.

## Adding a task

Add a task to `tasks/read.ts` (answer, read-only), `tasks/debug.ts`, or
`tasks/write.ts` (state, full-access). Shared state-check helpers are in
`tasks/helpers.ts`:

- `id` (`<category>.<slug>`), `category`, `difficulty`, and a natural-language
  `prompt`. Never name a tool, command, or interface in the prompt.
- Answer tasks: `expected` is a static `AnswerSpec` or an oracle
  `(ts) => Promise<AnswerSpec>` built from `src/oracle.ts` helpers such as
  `uniqueMax` or `nthMostCommon`, which throw on ties. Also give a plausible
  wrong `decoy`.
- State tasks: `check(ts)` returns `{ pass, detail }` from direct HTTP reads,
  and `reference(ts)` performs a correct fix with direct HTTP.

Then run `pnpm eval --dry-run -t <id>`. It must show the expected value, that
the grader accepts it and rejects the decoy, and, for state tasks, that the
check fails on a fresh seed and passes after the reference fix.

## What the eval is designed to surface

`--dry-run` / `--inspect` already show these without any model calls (Typesense 30.2):

| | TypesenseKit MCP read-only | TypesenseKit MCP full-access | TypesenseKit CLI |
| --- | --- | --- | --- |
| Tools visible to the agent | 45 MCP + 2 resource tools | 95 MCP + 2 resource tools | 1 (`Bash`) |
| Tool definitions | 12,468 chars | 31,426 chars | `tsk operations` listing: 4,687 chars, read on demand |
| Descriptions under 40 chars | 39 of 45 | 82 of 95 | – |
| Dotted names (renamed `a.b` → `a_b` for the model) | 39 | 89 | – |
| Untyped `params` maps | `search`, `documents.search`, `documents.export` | 17 tools | same schemas via `--schema` |

Model runs then show whether these cost task success. Watch for:

- wrong-tool mixes between `search` and `documents.search`
- `invalid_args` errors from missing `query_by` / `filter_by` syntax
- `unknown_tool` hits on legacy `synonyms.*` / `overrides.*`, which are
  unavailable on Typesense 30
- CLI discovery overhead
- CLI errors that include full JS stack traces

## Development

```sh
pnpm --filter @typesensekit/evals test        # unit tests: graders, shell guard, metrics, report
pnpm --filter @typesensekit/evals typecheck   # also part of root `pnpm typecheck`
```
