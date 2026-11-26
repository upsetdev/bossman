// The Codex config for a sandbox: one LiteLLM provider and an alias as the model.
// Codex reads providers only from its user-level config, ~/.codex/config.toml.

export function codexConfig(alias: string, litellmBaseUrl: string): string {
  const base = litellmBaseUrl.replace(/\/+$/, "");
  return [
    `model = ${JSON.stringify(alias)}`,
    `model_provider = "litellm"`,
    `approval_policy = "never"`,
    `sandbox_mode = "danger-full-access"`,
    ``,
    `[model_providers.litellm]`,
    `name = "LiteLLM"`,
    `base_url = ${JSON.stringify(`${base}/v1`)}`,
    `env_key = "LITELLM_API_KEY"`,
    `wire_api = "responses"`,
    ``,
  ].join("\n");
}
