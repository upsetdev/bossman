// Sandbox sizes for each tier and for bossman check. bossman.jsonc can change
// any of them under "sizes". The ranges are Pyo Sandbox's limits per sandbox.

export type SizeName = "junior" | "senior" | "expert" | "check";
export interface Size {
  cpus: number;
  memoryMib: number;
  diskMib: number;
}

export const DEFAULT_SIZES: Record<SizeName, Size> = {
  junior: { cpus: 2, memoryMib: 4096, diskMib: 8192 },
  senior: { cpus: 2, memoryMib: 4096, diskMib: 8192 },
  expert: { cpus: 4, memoryMib: 8192, diskMib: 16384 },
  check: { cpus: 2, memoryMib: 4096, diskMib: 8192 },
};

const RANGES: Record<keyof Size, [number, number]> = {
  cpus: [1, 32],
  memoryMib: [128, 64 * 1024],
  diskMib: [64, 256 * 1024],
};

// Returns the sizes, or an error message for the first value that's wrong.
export function resolveSizes(input: unknown): Record<SizeName, Size> | string {
  const out: Record<SizeName, Size> = structuredClone(DEFAULT_SIZES);
  if (input === undefined) return out;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return `sizes in bossman.jsonc must be an object, like { "junior": { "memoryMib": 2048 } }.`;
  }
  for (const [name, value] of Object.entries(input)) {
    if (!(name in out)) {
      return `sizes.${name} in bossman.jsonc isn't known. Use junior, senior, expert or check.`;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return `sizes.${name} in bossman.jsonc must be an object, like { "memoryMib": 2048 }.`;
    }
    for (const [key, n] of Object.entries(value)) {
      if (!(key in RANGES)) {
        return `sizes.${name}.${key} in bossman.jsonc isn't known. Use cpus, memoryMib or diskMib.`;
      }
      const [min, max] = RANGES[key as keyof Size];
      if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
        return `sizes.${name}.${key} in bossman.jsonc must be a whole number from ${min} to ${max}.`;
      }
      out[name as SizeName][key as keyof Size] = n;
    }
  }
  return out;
}
