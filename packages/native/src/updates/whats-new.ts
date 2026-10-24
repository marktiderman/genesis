/**
 * What's new: release notes shown once per version, remembered in storage.
 *
 * - First launch after an install (nothing stored): nothing shows; the
 *   version is remembered, so a new install never opens on a sheet.
 * - A newer version than the one remembered: the notes for every version
 *   after it, up to this one, newest first. Closing them remembers this
 *   version. With no notes for it, the version is remembered once the policy
 *   has answered from the network (or there is no policy source), so notes
 *   that arrive late still show.
 * - Storage that can't be read shows nothing (rather than every launch).
 */
import { createStore, type Store } from "./store";
import { compareVersions } from "./version";
import { toError, type UpdatesOnError, type UpdatesStorageLike } from "./modules";
import type { ReleaseNote } from "./policy";

export interface WhatsNewState {
  status: "loading" | "hidden" | "showing";
  notes: readonly ReleaseNote[];
}

export interface WhatsNewOptions {
  storage?: UpdatesStorageLike;
  /** The installed version notes are matched against. `null`: never shows. */
  version: string | null;
  /** Default `"genesis:updates:seen-version"`. */
  storageKey?: string;
  onError?: UpdatesOnError;
}

export interface WhatsNewStore extends Pick<Store<WhatsNewState>, "getState" | "subscribe"> {
  /** Read the remembered version. Never rejects; runs once. */
  load(): Promise<void>;
  /** Recompute with the notes known now; `final` once no more notes can arrive. */
  update(notes: readonly ReleaseNote[], final: boolean): void;
  /** Close the notes and remember this version. */
  dismiss(): void;
}

/** The notes after `seen`, up to `version`, newest first. */
export function notesSince(notes: readonly ReleaseNote[], seen: string, version: string): ReleaseNote[] {
  return notes
    .filter((note) => {
      if (note.version === version) return seen !== version;
      const afterSeen = compareVersions(note.version, seen);
      const upToNow = compareVersions(note.version, version);
      return afterSeen === 1 && (upToNow === -1 || upToNow === 0);
    })
    .sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

export function createWhatsNewStore(options: WhatsNewOptions): WhatsNewStore {
  const { storage, version, storageKey = "genesis:updates:seen-version", onError } = options;
  const store = createStore<WhatsNewState>({ status: "loading", notes: [] });
  // undefined: not read yet; null: nothing stored (a fresh install); false: unreadable.
  let seen: string | null | false | undefined;
  let loading: Promise<void> | null = null;
  let pending: { notes: readonly ReleaseNote[]; final: boolean } | null = null;

  const remember = () => {
    if (!storage || !version) return;
    seen = version;
    storage.setItem(storageKey, version).catch((error) => {
      try {
        onError?.(toError(error), "storage");
      } catch {
        // ignore a failing reporter
      }
    });
  };

  const compute = (notes: readonly ReleaseNote[], final: boolean) => {
    if (seen === undefined) {
      pending = { notes, final };
      return;
    }
    if (!version || seen === false) return store.setState({ status: "hidden", notes: [] });
    if (seen === null) {
      remember();
      return store.setState({ status: "hidden", notes: [] });
    }
    const due = notesSince(notes, seen, version);
    if (due.length > 0) return store.setState({ status: "showing", notes: due });
    if (final && seen !== version) remember();
    store.setState({ status: "hidden", notes: [] });
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    load() {
      loading ??= (async () => {
        if (!storage || !version) {
          seen = false;
        } else {
          try {
            seen = await storage.getItem(storageKey);
          } catch (error) {
            seen = false;
            try {
              onError?.(toError(error), "storage");
            } catch {
              // ignore a failing reporter
            }
          }
        }
        const next = pending ?? { notes: [], final: false };
        pending = null;
        compute(next.notes, next.final);
      })();
      return loading;
    },
    update: compute,
    dismiss() {
      remember();
      store.setState({ status: "hidden", notes: [] });
    },
  };
}
