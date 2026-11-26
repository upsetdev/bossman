# Decisions

## 2026-11-26

- The project is named `bossman`. The repo, the command and the scoped npm package (`@upsetdev/bossman`) use it. The unscoped npm name is taken.
- Agents are named `leader`, `junior`, `senior`, `expert` and `reviewer`. Not "Chief of Staff" or "lead".
- `leader` runs on a strong model (`litellm/premium`). It plans and hands out work, and is not allowed to edit code. A weak leader makes bad plans, and that costs more than it saves.
- `leader` runs on your own machine. Each task runs in its own fresh Pyo sandbox.
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
- Codex runs with `--sandbox danger-full-access` and `approval_policy = "never"`. The Pyo sandbox is the isolation, as OpenAI's docs suggest for an isolated runner.
