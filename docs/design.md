# Design

## Flow

```
you ── bossman "<prompt>" ──► leader (OpenCode, your machine)
                                │ writes PLAN.md and specs/<id>.md
                                ├─► junior / senior / expert  (thin subagents on litellm/fast)
                                │      └─ bossman task --tier … ──► fresh Pyo Sandbox
                                │                                    agent works, tests run
                                │      ◄── commits on task/<id> ─────┘
                                ├─► reviewer reads the task branch
                                ├─ merges task/<id> with --no-ff, in PLAN.md order
                                └─ bossman check ──► fresh Pyo Sandbox, full test suite
                                       fail: git revert -m 1, and a new senior task
```

## After a merge

`bossman check` runs the full test command on one commit:

1. Points a private ref, `refs/bossman/check`, at the commit and bundles it. The ref is deleted right away.
2. Creates a sandbox with no env. No agent runs, so it gets no keys.
3. Fetches the ref from the bundle and checks out the commit. `git clone` would skip a ref outside branches and tags.
4. Runs the test command and prints a JSON report with `pass` or `fail`.

## One task

`bossman task` does this:

1. Makes a git worktree at `.bossman/worktrees/<id>` on a new branch `task/<id>`.
2. Bundles that branch with `git bundle`.
3. Creates a sandbox from `base` with only the env this tier needs.
4. Uploads the bundle and the spec, then clones the bundle in the sandbox.
5. Runs the agent with the first runner for its tier in `bossman.jsonc`:
   - `litellm/<alias>`: `opencode run` on that alias, with the repo's `providers.litellm` block
   - `codex:litellm/<alias>`: `codex exec --json --sandbox danger-full-access`, with a `~/.codex/config.toml` that points at LiteLLM's Responses API
   - `claude:max` or `claude:pro`: `claude -p` with that plan's token. At the plan's usage limit, it tries the next runner.
6. Commits anything left uncommitted, then runs the test command if one was given.
7. Reads the new commits back with `git format-patch` and applies them to the worktree with `git am`.
8. Deletes the sandbox and prints a short JSON report.

## Untested

Check each of these against a real sandbox server before relying on it:

- How `claude -p` reports a usage limit. `bossman task` looks for "usage limit" or "rate limit" in its output.
- The exit code `opencode run` returns when a run fails, and the JSON field that holds the session id. `bossman` reads both.
- Whether `opencode run --standalone --session <id>` can resume a session made by an earlier standalone run.
- Whether OpenCode fills in `${LITELLM_BASE_URL}` inside `baseURL`. Its docs mention `${NAME}` placeholders there.
- That `claude -p --permission-mode bypassPermissions` runs as root in a sandbox. `bossman task` sets `IS_SANDBOX=1` for it.
- `@pyodev/sandbox` 0.4.0 on npm needs `template` and has no `name` option. The SDK's source has moved on since that release. Recheck after the next release.
- That `opencode run --standalone`, which `bossman` uses, can see a ChatGPT sign-in saved by the normal OpenCode service.
- That Codex accepts the generated `~/.codex/config.toml`. Codex wasn't installed where this was written.
- That LiteLLM's `/v1/responses` works for each alias Codex uses, including aliases that map to non-OpenAI models.
- How Codex handles a model name it doesn't know, like `premium`. It may warn or pick wrong defaults for context size.
- That sandbox traffic leaves through the sandbox server's public address, so a LiteLLM firewall rule can allow only that address.
