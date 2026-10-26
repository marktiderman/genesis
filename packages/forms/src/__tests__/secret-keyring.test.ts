import { describe, expect, it } from "vitest";
import {
  createSecrets,
  DeliveryError,
  deriveSecretKey,
  isSecretError,
  openSecret,
  parseKeyring,
  sealSecret,
  SecretError,
} from "../destinations";

const k1 = Buffer.from("a".repeat(32)).toString("base64");
const k2 = Buffer.from("b".repeat(32)).toString("base64");

describe("destination secrets move onto a keyring", () => {
  it("a keyring opens what sealSecret sealed, and reseals it under the active key", async () => {
    const legacy = await sealSecret(
      await deriveSecretKey(k1, "hook-v1"),
      "https://hooks.example.com/h",
      "destination:d1",
    );
    const secrets = createSecrets(
      { active: "k2", keys: { k1, k2 } },
      { purpose: "hook-v1" },
    );
    expect(await secrets.open(legacy, "destination:d1")).toBe(
      "https://hooks.example.com/h",
    );
    expect(secrets.needsRotation(legacy)).toBe(true);
    const resealed = await secrets.reseal(legacy, "destination:d1");
    expect(resealed.startsWith("v2.k2.")).toBe(true);
    expect(parseKeyring(k1).active).toBe("k1");
  });

  it("openSecret still throws a permanent DeliveryError, not a SecretError, for v2 text", async () => {
    const key = await deriveSecretKey(k1, "hook-v1");
    const error = await openSecret(key, "v2.k1.a.b", "destination:d1").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).not.toBeInstanceOf(SecretError);
    expect((error as DeliveryError).retryable).toBe(false);
  });

  it("isSecretError recognises a keyring error, whichever copy threw it", async () => {
    const error = await createSecrets(k1, { purpose: "p" })
      .open("bad", "row")
      .catch((e: unknown) => e);
    expect(isSecretError(error)).toBe(true);
    expect(isSecretError(new DeliveryError("x"))).toBe(false);
  });
});
