// @feat:connect
import { describe, expect, it } from "vitest";
import {
  createSecrets,
  deriveSecretKey,
  isSecretError,
  openWithKey,
  parseKeyring,
  sealWithKey,
  SecretError,
  secretKeyBytes,
  type KeyringInput,
} from "../secrets";

const k1 = Buffer.from("1".repeat(32)).toString("base64");
const k2 = Buffer.from("2".repeat(32)).toString("base64");
const k3 = Buffer.from("3".repeat(32)).toString("base64url");

async function rejection(promise: Promise<unknown>): Promise<SecretError> {
  try {
    await promise;
  } catch (error) {
    return error as SecretError;
  }
  throw new Error("expected a rejection");
}

describe("parseKeyring", () => {
  it("reads JSON text, an object, or a bare key as k1", () => {
    const fromJson = parseKeyring(
      JSON.stringify({ active: "k2", keys: { k1, k2 } }),
    );
    expect(fromJson.active).toBe("k2");
    expect([...fromJson.keys.keys()]).toEqual(["k1", "k2"]);
    expect(
      parseKeyring({ active: "k1", keys: { k1: secretKeyBytes(k1) } }).active,
    ).toBe("k1");
    const bare = parseKeyring(` ${k3} `);
    expect(bare.active).toBe("k1");
    expect(bare.keys.get("k1")).toEqual(secretKeyBytes(k3));
  });

  it("refuses malformed keyrings without quoting a key", () => {
    const cases: unknown[] = [
      "",
      "{not json " + k1,
      { active: "k3", keys: { k1 } },
      { active: "k1", keys: {} },
      { active: "bad.id", keys: { "bad.id": k1 } },
      { active: "k1", keys: { k1: "c2hvcnQ=" } },
      { active: "k1", keys: { k1: 42 } },
      { keys: { k1 } },
    ];
    for (const input of cases) {
      let error: unknown;
      try {
        parseKeyring(input as string);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SecretError);
      expect((error as SecretError).code).toBe("key");
      expect((error as Error).message).not.toContain(k1);
    }
  });
});

describe("createSecrets", () => {
  const ring = { active: "k1", keys: { k1 } };

  it("seals as v2 with the active key id and opens with the same aad", async () => {
    const secrets = createSecrets(ring, { purpose: "refresh-token" });
    const sealed = await secrets.seal("1//refresh", "grant:g1");
    expect(sealed).toMatch(/^v2\.k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("refresh");
    expect(await secrets.open(sealed, "grant:g1")).toBe("1//refresh");
    expect(await secrets.seal("same", "a")).not.toBe(
      await secrets.seal("same", "a"),
    );
  });

  it("refuses another row's secret (aad mismatch), another purpose, and a tampered one", async () => {
    const secrets = createSecrets(ring, { purpose: "refresh-token" });
    const sealed = await secrets.seal("secret-value", "grant:g1");
    const wrongRow = await rejection(secrets.open(sealed, "grant:g2"));
    expect(wrongRow.code).toBe("decrypt");
    expect(wrongRow.message).toBe("The stored secret could not be decrypted");
    expect(wrongRow.message).not.toContain("secret-value");
    expect(
      (
        await rejection(
          createSecrets(ring, { purpose: "other" }).open(sealed, "grant:g1"),
        )
      ).code,
    ).toBe("decrypt");
    expect(
      (
        await rejection(
          createSecrets(ring, { purpose: "refresh-token", salt: "s" }).open(
            sealed,
            "grant:g1",
          ),
        )
      ).code,
    ).toBe("decrypt");
    const parts = sealed.split(".");
    const flipped = parts[3]!.startsWith("A")
      ? `B${parts[3]!.slice(1)}`
      : `A${parts[3]!.slice(1)}`;
    expect(
      (
        await rejection(
          secrets.open([...parts.slice(0, 3), flipped].join("."), "grant:g1"),
        )
      ).code,
    ).toBe("decrypt");
  });

  it("binds the key id: relabelling a secret with another key id fails", async () => {
    const secrets = createSecrets(
      { active: "k2", keys: { k1, k2: k1 } },
      { purpose: "p" },
    );
    const sealed = await secrets.seal("x", "row");
    expect(
      (await rejection(secrets.open(sealed.replace("v2.k2.", "v2.k1."), "row")))
        .code,
    ).toBe("decrypt");
  });

  it("requires associated data and a purpose", async () => {
    const secrets = createSecrets(ring, { purpose: "p" });
    expect((await rejection(secrets.seal("x", ""))).code).toBe("usage");
    expect((await rejection(secrets.open("v2.k1.a.b", ""))).code).toBe("usage");
    expect(() => createSecrets(ring, { purpose: "" })).toThrow(SecretError);
  });

  it("refuses unknown formats", async () => {
    const secrets = createSecrets(ring, { purpose: "p" });
    for (const bad of [
      "",
      "v3.k1.a.b",
      "v2.a.b",
      "v1.a",
      "v2.k!.a.b",
      "v1.a.b.c",
      "plain text",
    ]) {
      const error = await rejection(secrets.open(bad, "row"));
      expect(error.code).toBe("format");
      expect(error.message).toBe("The stored secret is not in a known format");
    }
  });

  it("rotates keys: old secrets still open, needsRotation and reseal move them to the active key", async () => {
    const before = createSecrets(
      { active: "k1", keys: { k1 } },
      { purpose: "p" },
    );
    const old = await before.seal("token", "row-1");
    const after = createSecrets(
      JSON.stringify({ active: "k2", keys: { k1, k2 } }),
      { purpose: "p" },
    );
    expect(after.activeKeyId).toBe("k2");
    expect(after.keyIdOf(old)).toBe("k1");
    expect(after.needsRotation(old)).toBe(true);
    expect(await after.open(old, "row-1")).toBe("token");
    const fresh = await after.reseal(old, "row-1");
    expect(after.keyIdOf(fresh)).toBe("k2");
    expect(after.needsRotation(fresh)).toBe(false);
    expect(await after.reseal(fresh, "row-1")).toBe(fresh);
    expect(await after.open(fresh, "row-1")).toBe("token");
    // Once k1 is dropped, what it sealed names a key that is gone.
    const dropped = createSecrets(
      { active: "k2", keys: { k2 } },
      { purpose: "p" },
    );
    expect(await dropped.open(fresh, "row-1")).toBe("token");
    const gone = await rejection(dropped.open(old, "row-1"));
    expect(gone.code).toBe("unknown-key");
    expect(gone.message).not.toContain(k1);
    // reseal of a current secret still checks it opens.
    expect((await rejection(after.reseal(fresh, "row-2"))).code).toBe(
      "decrypt",
    );
    expect(after.needsRotation("garbage")).toBe(true);
    expect(after.keyIdOf("garbage")).toBeNull();
  });

  it("opens legacy v1 secrets (genesis-forms' sealSecret) with legacyKeyId's key, and reseals them as v2", async () => {
    const legacy = await sealWithKey(
      await deriveSecretKey(k1, "hook-v1"),
      '{"url":"https://hooks.example.com/h"}',
      "destination:d1",
    );
    expect(legacy.startsWith("v1.")).toBe(true);
    // A bare key becomes k1, the default legacyKeyId.
    const single = createSecrets(k1, { purpose: "hook-v1" });
    expect(await single.open(legacy, "destination:d1")).toBe(
      '{"url":"https://hooks.example.com/h"}',
    );
    expect(single.keyIdOf(legacy)).toBe("k1");
    expect(single.needsRotation(legacy)).toBe(true);
    // After rotation the legacy key keeps another name.
    const rotated = createSecrets(
      { active: "new", keys: { old: k1, new: k2 } },
      { purpose: "hook-v1", legacyKeyId: "old" },
    );
    const resealed = await rotated.reseal(legacy, "destination:d1");
    expect(resealed.startsWith("v2.new.")).toBe(true);
    expect(await rotated.open(resealed, "destination:d1")).toBe(
      '{"url":"https://hooks.example.com/h"}',
    );
    expect((await rejection(rotated.open(legacy, "destination:d2"))).code).toBe(
      "decrypt",
    );
    // Without the right legacy key id, v1 is an unknown key.
    expect(
      (
        await rejection(
          createSecrets(
            { active: "new", keys: { new: k2 } },
            { purpose: "hook-v1" },
          ).open(legacy, "destination:d1"),
        )
      ).code,
    ).toBe("unknown-key");
  });

  it("keeps the HKDF salt as before", async () => {
    const salted = await sealWithKey(
      await deriveSecretKey(k1, "p", { salt: "app-salt" }),
      "x",
      "row",
    );
    expect(
      await createSecrets(k1, { purpose: "p", salt: "app-salt" }).open(
        salted,
        "row",
      ),
    ).toBe("x");
    expect(
      (await rejection(createSecrets(k1, { purpose: "p" }).open(salted, "row")))
        .code,
    ).toBe("decrypt");
    const v2 = await createSecrets(k1, {
      purpose: "p",
      salt: new Uint8Array([1, 2, 3]),
    }).seal("y", "row");
    expect(
      await createSecrets(k1, {
        purpose: "p",
        salt: new Uint8Array([1, 2, 3]),
      }).open(v2, "row"),
    ).toBe("y");
  });
});

describe("the single-key v1 helpers", () => {
  it("round-trip and refuse v2 text", async () => {
    const key = await deriveSecretKey(k1, "p");
    const sealed = await sealWithKey(key, "x", "row");
    expect(await openWithKey(key, sealed, "row")).toBe("x");
    expect((await rejection(openWithKey(key, "v2.k1.a.b", "row"))).code).toBe(
      "format",
    );
  });

  it("checks key bytes without echoing them", () => {
    expect(secretKeyBytes(k1)).toEqual(
      new Uint8Array(Buffer.from("1".repeat(32))),
    );
    expect(() => secretKeyBytes("")).toThrow("The encryption key is not set");
    expect(() => secretKeyBytes("c2hvcnQ=")).toThrow("must be 32 bytes");
    expect(() => secretKeyBytes("not base64 at all!")).toThrow("is not base64");
    expect(() => secretKeyBytes(new Uint8Array(16))).toThrow(
      "must be 32 bytes",
    );
  });
});

describe("review follow-ups", () => {
  it("derives v2 keys apart from v1: a v2 ciphertext passed off as v1 does not open", async () => {
    const secrets = createSecrets(k1, { purpose: "p" });
    const sealed = await secrets.seal("x", "row");
    const [, kid, iv, body] = sealed.split(".");
    // As v1, with the aad v2 binds, under the same key and purpose.
    const forged = `v1.${iv}.${body}`;
    expect((await rejection(secrets.open(forged, `v2.${kid}.row`))).code).toBe(
      "decrypt",
    );
    expect(
      (
        await rejection(
          openWithKey(await deriveSecretKey(k1, "p"), forged, `v2.${kid}.row`),
        )
      ).code,
    ).toBe("decrypt");
    // v1 stays byte-compatible: what sealWithKey sealed still opens.
    const legacy = await sealWithKey(
      await deriveSecretKey(k1, "p"),
      "y",
      "row",
    );
    expect(await secrets.open(legacy, "row")).toBe("y");
  });

  it("never quotes key ids in keyring errors", () => {
    for (const input of <KeyringInput[]>[
      { active: "secret-kid", keys: { "secret-kid": "c2hvcnQ=" } },
      { active: "missing-kid", keys: { k1 } },
    ]) {
      let message = "";
      try {
        parseKeyring(input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/keyring/);
      expect(message).not.toMatch(/secret-kid|missing-kid/);
    }
  });

  it("brands SecretError for checks across bundles", async () => {
    const error = await rejection(
      createSecrets(k1, { purpose: "p" }).open("bad", "row"),
    );
    expect(isSecretError(error)).toBe(true);
    expect(
      isSecretError(
        Object.assign(new Error("x"), { name: "SecretError", code: "decrypt" }),
      ),
    ).toBe(true);
    expect(isSecretError(new Error("x"))).toBe(false);
  });
});
