// @feat:forms-destinations
// `pnpm --filter @marktiderman/genesis-forms build` works on a fresh clone: the
// shared runner is bundled from genesis-notifications' source, not its dist
// (which only exists once notifications has been built).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tsup.config";

describe("the forms build", () => {
  it("reads the notifications runner from source, for the bundle and the types", () => {
    const options = (Array.isArray(config) ? config[0] : config) as { esbuildOptions?: (o: { alias?: Record<string, string> }) => void };
    const esbuild: { alias?: Record<string, string> } = {};
    options.esbuildOptions?.(esbuild);
    const target = esbuild.alias?.["@marktiderman/genesis-notifications/runner"];
    expect(target).toMatch(/notifications[\\/]src[\\/]runner[\\/]index\.ts$/);
    expect(existsSync(target!)).toBe(true);
    const tsconfig = JSON.parse(readFileSync(join(__dirname, "../../tsconfig.json"), "utf8")) as { compilerOptions: { paths?: Record<string, string[]> } };
    const mapped = tsconfig.compilerOptions.paths?.["@marktiderman/genesis-notifications/runner"]?.[0];
    expect(mapped && existsSync(join(__dirname, "../..", mapped))).toBe(true);
  });
});
