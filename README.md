<p align="center"><img src="assets/logo.svg" width="128" height="128" alt="bossman logo"></p>

# bossman

Splits coding work across models by difficulty. You give one prompt. The `leader` agent plans the work and hands each task to `junior`, `senior` or `expert`. Each task runs in its own [Pyo sandbox](https://pyo.dev/docs/sandbox).

| Agent | Runs on | Does |
| --- | --- | --- |
| `leader` | `litellm/premium` | Writes `PLAN.md` and task specs, picks a tier per task, merges branches |
| `junior` | `litellm/fast` | Small, clear tasks: boilerplate, config, CRUD, docs |
| `senior` | `litellm/balanced` | Features across files, debugging, merge conflicts |
| `expert` | Claude Code on your Max plan, else `litellm/premium` | Hard tasks, or a task that failed twice |
| `reviewer` | `litellm/balanced` | Read-only check of each finished task |

`leader` and `reviewer` run on your machine. Every task runs in a fresh sandbox, and the result comes back as commits on a `task/<id>` branch.

## Requirements

- [OpenCode](https://opencode.ai) V2 and [Bun](https://bun.sh)
- A [LiteLLM](https://docs.litellm.ai) proxy with the model aliases `fast`, `balanced` and `premium`, on a public HTTPS address. Sandboxes can't reach private networks.
- A Pyo installation with a sandbox server, and an API key with **Sandboxes** access
- Your machine on the same tailnet as the sandbox server
- For `expert` on a Claude plan: a token from `claude setup-token`

## Install

```sh
git clone <this repo> ~/bossman
cd ~/bossman/worker && bun install
export PATH="$HOME/bossman/bin:$PATH"
```

## Configure

Set these in your shell. Read the secrets from your password manager. Never put them in a file in a repo.

| Variable | What it is |
| --- | --- |
| `LITELLM_BASE_URL` | Your LiteLLM address, like `https://llm.example.com` |
| `LITELLM_API_KEY` | A LiteLLM virtual key with a budget |
| `PYO_URL` | Your Pyo, like `https://pyo.tail1234.ts.net` |
| `PYO_API_KEY` | A Pyo API key with **Sandboxes** access |
| `PYO_TEAM` | Your team's id, if the key has more than one team |
| `BOSSMAN_CLAUDE_MAX_TOKEN` | Optional. `claude setup-token` output for your Max account |
| `BOSSMAN_CLAUDE_PRO_TOKEN` | Optional. Only used when `bossman.jsonc` lists `claude:pro` |
| `BOSSMAN_NOTIFY` | Optional. A command that takes one message, run when `bossman` finishes or stops |

## Use

In the repository of the app you want to build:

```sh
bossman init                       # adds the agents, opencode.jsonc and bossman.jsonc
bossman "Build a todo app with a REST API and a React frontend"
```

`bossman` runs `leader`, and resumes it if a run fails, up to 5 times. Progress is kept in `PLAN.md` and on the task branches, so a stopped run can pick up again.

### Files bossman makes

`leader` splits the work into numbered tasks. For task 3, that's:

| File or branch | What it holds |
| --- | --- |
| `PLAN.md` | Every task with its number, tier, dependencies and status: todo, doing, done or failed |
| `specs/3.md` | The task's instructions: the goal, the files to change and the test command. The worker gets nothing else |
| `task/3` | The git branch the task's commits come back on. `leader` merges it after review and `worker check` pass |
| `.bossman/` | Worktrees, logs, bundles and patches. It's in `.gitignore` |

For example, `PLAN.md` might hold:

```markdown
1. senior · todo · Set up the API server and database schema
2. junior · todo · Add the todo CRUD routes (needs 1)
3. expert · todo · Add sign-in with sessions (needs 1)
```

`leader` normally runs each task for you. To run one by hand, for example task 3:

```sh
worker run --tier senior --task 3 --spec specs/3.md --test "bun test"
```

## Tests

Set the full test command in `bossman.jsonc`:

```jsonc
{ "test": "bun install && bun test" }
```

Tests are checked at three points:

| When | Who | What |
| --- | --- | --- |
| After each task | `worker run` | Runs the spec's test command in the task's sandbox. Falls back to `test` from `bossman.jsonc` |
| After each task | `reviewer` | Reads the task's diff against its spec. It doesn't run anything |
| After each merge | `worker check` | Runs `test` on the merged code in a fresh sandbox, with no agent and no keys. If it fails, `leader` reverts the merge and adds a task to fix it |

For important code, `leader` first adds a task that writes the tests, on a different tier from the code task. Then one agent doesn't write both the code and the tests that grade it.

To check a commit by hand:

```sh
worker check                 # HEAD
worker check --ref main --test "pnpm test"
```

## Models and providers

**LiteLLM aliases.** Point `fast`, `balanced` and `premium` at any provider LiteLLM supports, like Gemini for `fast`, Claude for `balanced` and GPT for `premium`. Add more aliases in LiteLLM and list them under `providers.litellm.models` in `opencode.jsonc`. Sandboxes get the same block, so you set aliases in one place.

Add `"compatibility": { "cacheFormat": "anthropic" }` to each alias that maps to a Claude model. Claude's prompt cache needs it through LiteLLM. Leave it off for other providers.

**Tiers.** `bossman.jsonc` lists the runners each worker tier tries, in order:

```jsonc
{
  "tiers": {
    "junior": ["litellm/fast"],
    "senior": ["litellm/balanced"],
    "expert": ["claude:max", "litellm/premium"]
  }
}
```

| Runner | Runs |
| --- | --- |
| `litellm/<alias>` | OpenCode on that LiteLLM alias |
| `codex:litellm/<alias>` | Codex on that LiteLLM alias, with your LiteLLM key. The alias must work with LiteLLM's Responses API (`/v1/responses`) |
| `claude:max` | Claude Code on your Max plan. Skipped when `BOSSMAN_CLAUDE_MAX_TOKEN` isn't set |
| `claude:pro` | Claude Code on your Pro plan. Skipped when `BOSSMAN_CLAUDE_PRO_TOKEN` isn't set |

`worker` moves to the next runner when a Claude plan is at its usage limit. Without a `bossman.jsonc`, it uses the tiers above.

**leader and reviewer** run on your machine. Set their models in `.opencode/agents/leader.md` and `reviewer.md`. Run `reviewer` on a different provider from the workers, so a second model family checks the code.

## Leader on ChatGPT

OpenCode can sign in with a ChatGPT Plus or Pro plan. Then `leader` runs on your plan instead of per-token billing.

1. Run `opencode`, then `/connect`. Choose OpenAI, then **Sign in with ChatGPT**.
2. Run `/models` and note the ID of the model you want, like `openai/<model>`.
3. Set `model: openai/<model>` in `.opencode/agents/leader.md`.

Good to know:

- These requests don't go through LiteLLM, so they don't count against its budgets or show in its spend logs.
- OpenCode caps the context for ChatGPT sign-ins to match Codex.
- Use it only on your own machine. OpenAI asks for API keys for scripted Codex use, so bossman doesn't use ChatGPT sign-in in sandboxes. `codex:litellm/<alias>` runs Codex on your LiteLLM key instead.

## Claude plans

`expert` runs the unmodified `claude` binary with your own token. It runs one task per account at a time. Your token is passed only to the sandbox running that task. Anthropic's terms allow this for your own personal use. They don't allow routing plan credentials through other tools or sharing an account. See [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).

The default tiers use only your Max plan. When Max is at its usage limit, `expert` uses `litellm/premium`. To fall back to your Pro plan first, add `claude:pro` to `tiers.expert` yourself. Locks in `~/.bossman/locks` keep it to one task per account across all your repos.

## Status

Early. See [docs/design.md](docs/design.md) for what's untested.

## License

MIT. See [LICENSE](LICENSE).
