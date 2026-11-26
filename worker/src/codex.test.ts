import { expect, test } from "bun:test";
import { codexConfig } from "./codex";

test("points Codex at LiteLLM with the alias as the model", () => {
  const cfg = Bun.TOML.parse(codexConfig("premium", "https://llm.example.com/")) as Record<string, any>;
  expect(cfg.model).toBe("premium");
  expect(cfg.model_provider).toBe("litellm");
  expect(cfg.approval_policy).toBe("never");
  expect(cfg.sandbox_mode).toBe("danger-full-access");
  expect(cfg.model_providers.litellm).toEqual({
    name: "LiteLLM",
    base_url: "https://llm.example.com/v1",
    env_key: "LITELLM_API_KEY",
    wire_api: "responses",
  });
});

test("never puts the key itself in the file", () => {
  expect(codexConfig("fast", "https://llm.example.com")).not.toMatch(/sk-|api_key\s*=/);
});
