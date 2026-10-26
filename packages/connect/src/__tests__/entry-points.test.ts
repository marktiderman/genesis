// @feat:connect
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dist = (file: string) =>
  fileURLToPath(new URL(`../../dist/${file}`, import.meta.url));
const built = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

// The built package: `.` and `/secrets` share one copy of the secret box, in each format.
describe.skipIf(!built)("entry points (dist)", () => {
  it("throws one SecretError class from both ESM entry points", async () => {
    const index = await import(dist("index.js"));
    const secrets = await import(dist("secrets.js"));
    expect(index.SecretError).toBe(secrets.SecretError);
    const error = await index
      .createSecrets(Buffer.alloc(32, 1).toString("base64"), { purpose: "p" })
      .open("bad", "row")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(secrets.SecretError);
    expect(secrets.isSecretError(error)).toBe(true);
  });

  it("throws one SecretError class from both CJS entry points, and brands match across formats", async () => {
    const require = createRequire(import.meta.url);
    const index = require(dist("index.cjs"));
    const secrets = require(dist("secrets.cjs"));
    expect(index.SecretError).toBe(secrets.SecretError);
    const esm = await import(dist("secrets.js"));
    const error = await index
      .createSecrets(Buffer.alloc(32, 1).toString("base64"), { purpose: "p" })
      .open("bad", "row")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(secrets.SecretError);
    // ESM and CJS are separate copies: the brand check spans them.
    expect(esm.isSecretError(error)).toBe(true);
    expect(index.isConnectError(new index.ConnectError("failed", "x"))).toBe(
      true,
    );
    expect(esm.isSecretError(new index.ConnectError("failed", "x"))).toBe(
      false,
    );
  });
});
