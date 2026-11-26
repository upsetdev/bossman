# Decisions

## 2026-11-26

- The project is named `bossman`. The repo, the command and the scoped npm package (`@upsetdev/bossman`) use it. The unscoped npm name is taken.
- Agents are named `leader`, `junior`, `senior`, `expert` and `reviewer`. Not "Chief of Staff" or "lead".
- `leader` runs on a strong model (`litellm/premium`). It plans and hands out work, and is not allowed to edit code. A weak leader makes bad plans, and that costs more than it saves.
- `leader` runs on your own machine. Each task runs in its own fresh Pyo Sandbox.
- Code goes into and out of a sandbox as a git bundle and a patch. Sandboxes never get a GitHub token.
- Claude plans are used only through the unmodified `claude` binary, with a `claude setup-token` token. Never through an OpenCode plugin or LiteLLM.
- One Claude task per account at a time.
- When Max is at its limit, `expert` falls back to `litellm/premium`. Pro is opt-in with `BOSSMAN_ALLOW_PRO=1`, since switching accounts to get around a usage limit is a gray area in Anthropic's terms.
- Jev is not used. It is a hosted decision model, not an orchestrator, and it sends task text to an outside service.
- Langfuse, Qdrant, Redis and secret managers are left out until there's a need.

### Later the same day

- Worker tiers are set in `bossman.jsonc` as ordered lists of runners: `litellm/<alias>`, `claude:max`, `claude:pro`. This replaces the fixed models in `worker`.
- Pro is opt-in by listing `claude:pro` in `tiers.expert`. The default tiers don't list it. This replaces `BOSSMAN_ALLOW_PRO` and `--allow-pro`.
- LiteLLM aliases are set once, in `providers.litellm` in the repo's `opencode.jsonc`. Sandboxes get a copy of that block.
- `cacheFormat: "anthropic"` goes only on aliases that map to Claude models.
- A ChatGPT plan may be used for `leader` on your own machine, through OpenCode's own sign-in. It's not used in sandboxes, since OpenAI asks for API keys for scripted Codex use.
- A Codex runner is left for later.

### Codex runner

- Codex runs as `codex:litellm/<alias>`: on your LiteLLM key, never on a ChatGPT sign-in. OpenAI asks for API keys for scripted Codex use.
- Codex runs with `--sandbox danger-full-access` and `approval_policy = "never"`. The Pyo Sandbox is the isolation, as OpenAI's docs suggest for an isolated runner.

### Tests after merging

- No tester agent. Running tests is a command, not a judgment, so `worker` runs them instead of a model.
- `worker check` runs the full test suite on the merged code after each merge. `leader` merges with `--no-ff`, so a failed check can be undone with `git revert -m 1`.
- For important code, `leader` makes a separate task that writes the tests first, on a different tier from the code task.

### Releases

- No release yet. The first one comes after every runner has been tested in a real sandbox.
- When it comes: install from npm as `@upsetdev/bossman`, published from GitHub Actions with provenance. GitHub Releases hold the tags and release notes. No prebuilt binaries for now.
- Order: `0.1.0-rc.1` under npm's `next` tag, installed on a throwaway machine first, then `0.1.0`.

### Pro in the default order

- 2026-11-26: the default order for `expert` is Max, then Pro, then `litellm/premium`. Users can set another order in `tiers.expert`. This replaces "Pro is opt-in". A plan whose token isn't set is skipped, so users without a Pro token get Max, then `litellm/premium`.

### One command

- 2026-11-26: bossman has one command. `worker run` is now `bossman task`, `worker check` is now `bossman check`, and `bin/worker` is removed without an alias, since there's no release yet.
- `leader` may run only `bossman check`, never `bossman` in general, so it can't start another `leader`. Each worker agent may run only `bossman task` for its own tier.

### Sandbox sizes

- 2026-11-26: sandbox sizes can be set per tier and for `bossman check` under `sizes` in `bossman.jsonc`. Unset values keep the defaults: 2 CPUs and 4 GiB for junior, senior and check, 4 CPUs and 8 GiB for expert. This lets bossman run on a small sandbox server, like a VM on a laptop.
