// @feat:app-updates
import { describe, expect, it } from "vitest";
import { createWhatsNewStore, notesSince } from "../../updates/whats-new";
import { brokenStorage, flush, memoryStorage } from "./fakes";

const KEY = "genesis:updates:seen-version";
const notes = [
  { version: "1.1.0", body: "One-one" },
  { version: "1.2.0", body: "One-two" },
  { version: "1.3.0", body: "Not yet" },
];

describe("what's new", () => {
  it("shows nothing on a fresh install, and remembers the version", async () => {
    const storage = memoryStorage();
    const store = createWhatsNewStore({ storage, version: "1.2.0" });
    store.update(notes, false);
    await store.load();
    expect(store.getState().status).toBe("hidden");
    await flush();
    expect(storage.data.get(KEY)).toBe("1.2.0");
  });

  it("shows the notes after the remembered version once, newest first", async () => {
    const storage = memoryStorage({ [KEY]: "1.0.0" });
    const store = createWhatsNewStore({ storage, version: "1.2.0" });
    await store.load();
    store.update(notes, true);
    expect(store.getState()).toEqual({ status: "showing", notes: [notes[1], notes[0]] });
    store.dismiss();
    expect(store.getState().status).toBe("hidden");
    await flush();
    expect(storage.data.get(KEY)).toBe("1.2.0");

    // The next launch, same version: nothing.
    const again = createWhatsNewStore({ storage, version: "1.2.0" });
    await again.load();
    again.update(notes, true);
    expect(again.getState().status).toBe("hidden");
  });

  it("remembers a version without notes only once no more notes can arrive", async () => {
    const storage = memoryStorage({ [KEY]: "1.2.0" });
    const store = createWhatsNewStore({ storage, version: "1.4.0" });
    await store.load();
    store.update([], false);
    await flush();
    expect(storage.data.get(KEY)).toBe("1.2.0");
    // The policy answers late, with notes for this version.
    store.update([{ version: "1.4.0", body: "Late" }], false);
    expect(store.getState().status).toBe("showing");
    store.dismiss();
    store.update([], true);
    await flush();
    expect(storage.data.get(KEY)).toBe("1.4.0");
  });

  it("shows nothing when storage can't be read", async () => {
    const store = createWhatsNewStore({ storage: brokenStorage(), version: "1.2.0" });
    await store.load();
    store.update(notes, true);
    expect(store.getState().status).toBe("hidden");
  });

  it("shows nothing without a version or storage", async () => {
    for (const store of [createWhatsNewStore({ storage: memoryStorage({ [KEY]: "1.0" }), version: null }), createWhatsNewStore({ version: "1.2.0" })]) {
      await store.load();
      store.update(notes, true);
      expect(store.getState().status).toBe("hidden");
    }
  });

  it("matches an unparseable version by its exact text only", () => {
    expect(notesSince([{ version: "2024.10-b", body: "x" }], "1.0", "2024.10-b")).toHaveLength(1);
    expect(notesSince([{ version: "garbage", body: "x" }], "1.0", "1.2")).toHaveLength(0);
  });
});
