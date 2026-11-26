import { expect, test } from "bun:test";
import { DEFAULT_SIZES, resolveSizes } from "./sizes";

test("uses the defaults without sizes", () => {
  expect(resolveSizes(undefined)).toEqual(DEFAULT_SIZES);
});

test("changes only the values given", () => {
  const s = resolveSizes({ expert: { memoryMib: 2048 }, check: { cpus: 1 } });
  if (typeof s === "string") throw new Error(s);
  expect(s.expert).toEqual({ cpus: 4, memoryMib: 2048, diskMib: 16384 });
  expect(s.check).toEqual({ cpus: 1, memoryMib: 4096, diskMib: 8192 });
  expect(s.junior).toEqual(DEFAULT_SIZES.junior);
});

test("never changes the defaults", () => {
  resolveSizes({ junior: { cpus: 8 } });
  expect(DEFAULT_SIZES.junior.cpus).toBe(2);
});

test("explains values that are wrong", () => {
  expect(resolveSizes([])).toContain("must be an object");
  expect(resolveSizes({ boss: {} })).toContain("sizes.boss in bossman.jsonc isn't known");
  expect(resolveSizes({ junior: { ram: 1 } })).toContain("sizes.junior.ram in bossman.jsonc isn't known");
  expect(resolveSizes({ junior: { memoryMib: 64 } })).toContain("from 128 to 65536");
  expect(resolveSizes({ junior: { cpus: 1.5 } })).toContain("whole number");
  expect(resolveSizes({ junior: { cpus: "2" } })).toContain("whole number");
});
