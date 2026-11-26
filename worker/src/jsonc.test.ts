import { expect, test } from "bun:test";
import { parseJsonc } from "./jsonc";

test("drops line and block comments", () => {
  expect(parseJsonc('{ // a\n "a": 1, /* b */ "b": 2 }')).toEqual({ a: 1, b: 2 });
});

test("keeps slashes inside strings", () => {
  expect(parseJsonc('{ "url": "https://llm.example.com/v1" } // c')).toEqual({ url: "https://llm.example.com/v1" });
});

test("keeps escaped quotes inside strings", () => {
  expect(parseJsonc('{ "s": "say \\"hi\\" // not a comment" }')).toEqual({ s: 'say "hi" // not a comment' });
});

test("allows trailing commas", () => {
  expect(parseJsonc('{ "a": [1, 2,], "b": { "c": 3, }, }')).toEqual({ a: [1, 2], b: { c: 3 } });
});

test("keeps commas inside strings", () => {
  expect(parseJsonc('{ "s": "a, }", "t": "b, ]", }')).toEqual({ s: "a, }", t: "b, ]" });
});

test("drops a trailing comma before a comment", () => {
  expect(parseJsonc('{ "a": 1, // last\n }')).toEqual({ a: 1 });
});

test("reads the template config", async () => {
  const text = await Bun.file(new URL("../../template/opencode.jsonc", import.meta.url)).text();
  const cfg = parseJsonc(text) as { providers: { litellm: { models: Record<string, unknown> } } };
  expect(Object.keys(cfg.providers.litellm.models)).toEqual(["fast", "balanced", "premium"]);
});
