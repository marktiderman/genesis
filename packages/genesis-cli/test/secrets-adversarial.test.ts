// @feat:doctor-fixes
/**
 * The second review's adversarial cases for the hidden prompt, redaction and the stores, on a
 * real stream (a PassThrough) rather than a hand-made terminal.
 */
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { drainInput, promptHidden } from "../src/exec/prompt-secret.js";
import { escapedForms, SecretError, SecretVault } from "../src/exec/secret-vault.js";
import { setterFor, stdinFor } from "../src/exec/secret-stores.js";

const VALUE = "s3cr3t-value-XYZ";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function realish() {
  const input = new PassThrough();
  const listeners: Record<string, Array<() => void>> = {};
  const killed: string[] = [];
  const raw = { mode: false };
  const proc = {
    pid: 1,
    once: (e: string, l: () => void) => (listeners[e] = [...(listeners[e] ?? []), l]),
    off: (e: string, l: () => void) => (listeners[e] = (listeners[e] ?? []).filter((x) => x !== l)),
    kill: (_pid: number, signal: string) => killed.push(signal),
  };
  const tty = Object.assign(input, { isRaw: false, setRawMode: (m: boolean) => (raw.mode = m) });
  const out: string[] = [];
  const ask = () => promptHidden("Q: ", { input: tty as never, output: { write: (t: string) => out.push(t) }, process: proc as never, settleMs: 10 });
  const emit = (e: string) => [...(listeners[e] ?? [])].forEach((l) => l());
  return { input, ask, out, emit, killed, raw };
}

describe("the hidden prompt, on a real stream", () => {
  it("refuses a paste whose second line comes after the first's Enter, and drains it", async () => {
    const t = realish();
    const first = t.ask();
    t.input.write(`${VALUE}\r`);
    await wait(5);
    t.input.write("second-line-of-paste\r");
    await wait(5);
    t.input.write("third-line\r");
    await expect(first).rejects.toThrow(/multi-line values aren't supported/);
    // Drained: the next prompt doesn't get the paste's tail as its answer.
    const second = t.ask();
    t.input.write(`${VALUE}\r`);
    await expect(second).resolves.toBe(VALUE);
  });

  it("refuses input already waiting when it starts (a paste slower than the settle window), throwing it away", async () => {
    const t = realish();
    const first = t.ask();
    t.input.write(`${VALUE}\r`);
    expect(await first).toBe(VALUE);
    // The rest of the paste arrives after the settle window, while stdin is paused.
    t.input.write("second-line-of-paste\r");
    await wait(20);
    const second = t.ask();
    await expect(second).rejects.toThrow(/already waiting/);
    const third = t.ask();
    t.input.write(`${VALUE}\r`);
    await expect(third).resolves.toBe(VALUE);
  });

  it("drainInput throws away what's left before exit", async () => {
    const t = realish();
    t.input.write("tail-of-a-paste\r");
    await drainInput({ input: t.input as never, quietMs: 10 });
    expect(t.input.read()).toBeNull();
  });

  it("accepts a CRLF Enter split across two reads", async () => {
    const t = realish();
    const p = t.ask();
    t.input.write(`${VALUE}\r`);
    await wait(2);
    t.input.write("\n");
    await expect(p).resolves.toBe(VALUE);
  });

  it.each([
    ["a zero-width space", "​"],
    ["a right-to-left override", "‮"],
    ["a line separator", " "],
    ["a byte-order mark", "﻿"],
    ["a C1 control", "\u0085"],
  ])("refuses %s", async (_, ch) => {
    const t = realish();
    const p = t.ask();
    t.input.write(`${VALUE}${ch}\r`);
    await expect(p).rejects.toThrow(/control, invisible or direction character/);
  });

  it("backspaces over a whole astral character, never leaving a lone surrogate", async () => {
    const t = realish();
    const p = t.ask();
    t.input.write(`${VALUE}😀\u007f\r`);
    expect(await p).toBe(VALUE);
    const q = t.ask();
    t.input.write(`${VALUE}😀\r`);
    expect(await q).toBe(`${VALUE}😀`);
  });

  it.each(["SIGINT", "SIGTERM", "SIGHUP"])("on an external %s: puts raw mode back, then raises it again", async (signal) => {
    const t = realish();
    const p = t.ask();
    expect(t.raw.mode).toBe(true);
    t.emit(signal);
    await expect(p).rejects.toThrow(new RegExp(`interrupted \\(${signal}\\)`));
    expect(t.raw.mode).toBe(false);
    expect(t.killed).toEqual([signal]);
  });
});

describe("redaction", () => {
  it("catches Go's HTML-safe JSON escapes (gh and supabase print them): & < > as \\u0026, \\u003c, \\u003e", () => {
    const v = new SecretVault();
    v.set("K", "abc&def<ghi>jkl");
    expect(v.redact('{"value":"abc\\u0026def\\u003cghi\\u003ejkl"}')).toBe('{"value":"[redacted]"}');
    expect(v.redact('{"value":"abc\\u0026def<ghi\\u003Ejkl"}')).toBe('{"value":"[redacted]"}');
  });

  it("catches \\u escapes in either case, mixed with plain characters", () => {
    const v = new SecretVault();
    v.set("K", "pässwörd-long");
    expect(v.redact("p\\u00E4ssw\\u00F6rd-long")).toBe("[redacted]");
    expect(v.redact("p\\u00e4ssw\\u00f6rd-long")).toBe("[redacted]");
    expect(v.redact("\\u0070\\u00E4ssw\\u00f6rd-long")).toBe("[redacted]");
    expect(v.redact("pässwörd-long")).toBe("[redacted]");
  });

  it("catches short escapes and an astral character's escaped surrogates", () => {
    const v = new SecretVault();
    v.set("K", 'a"b\\c/d😀e');
    expect(v.redact(JSON.stringify("a\"b\\c/d😀e"))).toBe('"[redacted]"');
    expect(v.redact('"a\\"b\\\\c\\/d\\ud83d\\uDE00e"')).toBe('"[redacted]"');
    expect(new RegExp(escapedForms("x.y")).test("xzy")).toBe(false);
  });

  it("redactJson honours toJSON: a Date is its ISO string", () => {
    const v = new SecretVault();
    const out = v.redactJson({ at: new Date(0), err: new Error("boom") });
    expect(JSON.stringify(out)).toBe('{"at":"1970-01-01T00:00:00.000Z","err":{}}');
  });

  it("redactJson keeps two keys that redact to the same text", () => {
    const v = new SecretVault();
    v.set("K", "keyvalue-1234");
    const out = v.redactJson({ "keyvalue-1234": 1, "[redacted]": 2 }) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["[redacted]", "[redacted] (2)"]);
    expect(Object.values(out).sort()).toEqual([1, 2]);
  });
});

describe("the Vault target", () => {
  it("never produces a command, and no stdin format writes Vault", () => {
    expect("manual" in setterFor("FOO_SECRET", "vault")).toBe(true);
    expect(() => stdinFor("vault-sql" as never, "FOO", VALUE)).toThrow(SecretError);
  });
});
