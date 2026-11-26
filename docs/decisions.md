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
