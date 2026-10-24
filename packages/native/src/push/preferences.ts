/**
 * The signed-in person's notification preferences: categories, quiet hours
 * and privacy previews. Loaded when they sign in, saved on every change
 * (shown at once, put back if the save fails), cleared when they sign out.
 * The server reads the saved row; nothing here decides what is delivered.
 */
import { createStore, type Store } from "../updates/store";
import { DEFAULT_PREFERENCES, type NotificationPreferences, type PushBackend, type QuietHours } from "./backend";
import { report, type PushOnError } from "./modules";
import { parseClock } from "./quiet-hours";

/** Android importance for a category's channel (Expo's `AndroidImportance`). */
export type ChannelImportance = "min" | "low" | "default" | "high" | "max";

/** One kind of notification the app sends, which a person can turn off. */
export interface NotificationCategory {
  /** Lower case letters, digits, ".", "_" or "-" (`messages`). Also its Android channel id, and the sender's `category`. */
  id: string;
  title: string;
  description?: string;
  /** On for someone who never chose. Default true; pass the same `defaultOn` to the sender. */
  defaultOn?: boolean;
  /** Android channel importance. Default `"default"`. */
  importance?: ChannelImportance;
}

export type PreferencesStatus = "idle" | "loading" | "ready" | "error";

export interface PreferencesState {
  status: PreferencesStatus;
  preferences: NotificationPreferences;
  saving: boolean;
  /** The last load or save that failed (the change was put back). */
  error: Error | null;
}

export interface PreferencesStore extends Store<PreferencesState> {
  load(userId: string): Promise<void>;
  /** Apply a change now and save it; on failure it is put back and `error` set. */
  update(change: (current: NotificationPreferences) => NotificationPreferences): Promise<boolean>;
  reset(): void;
  isOn(categoryId: string): boolean;
}

export const CATEGORY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Checks a change before it is shown or saved, so the server never has to refuse it. */
export function validPreferences(p: NotificationPreferences): boolean {
  const q: QuietHours = p.quietHours;
  if (parseClock(q.start) === null || parseClock(q.end) === null) return false;
  if (q.enabled && !q.timeZone) return false;
  return Object.keys(p.categories).every((id) => CATEGORY_ID.test(id));
}

export function createPreferencesStore(options: {
  backend: PushBackend;
  categories: readonly NotificationCategory[];
  onError?: PushOnError;
}): PreferencesStore {
  const { backend, categories, onError } = options;
  for (const category of categories) {
    if (!CATEGORY_ID.test(category.id)) throw new Error(`createPush: category id "${category.id}" must be lower case letters, digits, ".", "_" or "-"`);
  }
  const store = createStore<PreferencesState>({ status: "idle", preferences: DEFAULT_PREFERENCES, saving: false, error: null });
  let userId: string | null = null;
  // Each load or save belongs to one sign-in; an answer for an earlier one is dropped.
  let generation = 0;
  let saves: Promise<unknown> = Promise.resolve();
  let confirmed: NotificationPreferences = DEFAULT_PREFERENCES;
  let pending = 0;

  return {
    ...store,
    async load(id) {
      const mine = ++generation;
      userId = id;
      pending = 0;
      store.setState({ status: "loading", saving: false, error: null });
      try {
        const loaded = (await backend.loadPreferences()) ?? DEFAULT_PREFERENCES;
        if (mine !== generation) return;
        confirmed = loaded;
        store.setState({ status: "ready", preferences: loaded });
      } catch (error) {
        if (mine !== generation) return;
        report(onError, error, "preferences");
        store.setState({ status: "error", error: error instanceof Error ? error : new Error("Couldn't load notification settings") });
      }
    },
    update(change) {
      const id = userId;
      const mine = generation;
      if (!id) return Promise.resolve(false);
      const next = change(store.getState().preferences);
      if (!validPreferences(next)) return Promise.resolve(false);
      pending++;
      store.setState({ preferences: next, saving: true, error: null });
      // Saves go one at a time, in order; each carries every change before it.
      const save = saves.then(async () => {
        if (mine !== generation) return false;
        let ok = false;
        try {
          await backend.savePreferences(id, next);
          ok = true;
          if (mine === generation) confirmed = next;
        } catch (error) {
          if (mine === generation) {
            report(onError, error, "preferences");
            store.setState({ error: error instanceof Error ? error : new Error("Couldn't save notification settings") });
          }
        }
        if (mine !== generation) return false;
        pending--;
        // The last save settles what shows: the server's copy (a failed change is put back).
        if (pending === 0) store.setState({ preferences: confirmed, saving: false });
        return ok;
      });
      saves = save.catch(() => false);
      return save;
    },
    reset() {
      generation++;
      userId = null;
      pending = 0;
      confirmed = DEFAULT_PREFERENCES;
      store.setState({ status: "idle", preferences: DEFAULT_PREFERENCES, saving: false, error: null });
    },
    isOn(categoryId) {
      const chosen = store.getState().preferences.categories[categoryId];
      if (typeof chosen === "boolean") return chosen;
      return categories.find((c) => c.id === categoryId)?.defaultOn ?? true;
    },
  };
}
