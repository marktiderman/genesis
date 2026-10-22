import type {
  ChromeLike,
  MessageListener,
  MessageSender,
  Port,
  StorageArea,
  StorageChange,
} from "../chrome";

/**
 * A working fake of the extension APIs this package uses, for unit tests in
 * Node (vitest, happy-dom): storage that fires onChanged, messaging between
 * listeners with a sender you choose, scripting that runs the injected
 * function in the current document, the side panel, permissions, commands,
 * and native hosts you script.
 *
 *   const fake = installChromeFake();
 *   fake.nativeHost("com.acme.helper", (message, reply) => reply({ type: "done" }));
 *   ...
 *   fake.uninstall();
 */

export interface NativeHostScript {
  (
    message: Record<string, unknown>,
    reply: (message: unknown) => void,
    port: { disconnect(): void },
  ): void;
}

export interface ChromeFake extends ChromeLike {
  /** Deliver a message to the onMessage listeners as if from `sender`; resolves with the answer. */
  deliver(message: unknown, sender: MessageSender): Promise<unknown>;
  /** The sender for this extension's own page at `path`. */
  pageSender(path?: string): MessageSender;
  /** The sender for this extension's content script in tab `tabId`. */
  contentSender(tabId: number, url?: string): MessageSender;
  /** Script a native messaging host. */
  nativeHost(name: string, script: NativeHostScript): void;
  /** What the side panel was asked to do. */
  sidePanelCalls: {
    open: unknown[];
    behavior: { openPanelOnActionClick?: boolean };
  };
  granted: Set<string>;
  uninstall(): void;
}

function storageArea(
  name: string,
  fire: (changes: Record<string, StorageChange>, area: string) => void,
): StorageArea {
  const data = new Map<string, unknown>();
  const copy = (v: unknown) =>
    v === undefined ? undefined : structuredClone(v);
  return {
    async get(keys) {
      const list =
        keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        list.filter((k) => data.has(k)).map((k) => [k, copy(data.get(k))]),
      );
    },
    async set(items) {
      const changes: Record<string, StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: copy(data.get(k)), newValue: copy(v) };
        data.set(k, copy(v));
      }
      fire(changes, name);
    },
    async remove(keys) {
      const changes: Record<string, StorageChange> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (!data.has(k)) continue;
        changes[k] = { oldValue: copy(data.get(k)) };
        data.delete(k);
      }
      fire(changes, name);
    },
  };
}

function listeners<L extends (...args: never[]) => unknown>() {
  const set = new Set<L>();
  return {
    set,
    event: {
      addListener: (l: L) => void set.add(l),
      removeListener: (l: L) => void set.delete(l),
    },
  };
}

export function installChromeFake({
  id = "testextensionid",
}: { id?: string } = {}): ChromeFake {
  const base = `chrome-extension://${id}/`;
  const onMessage = listeners<MessageListener>();
  const onChanged =
    listeners<(changes: Record<string, StorageChange>, area: string) => void>();
  const fire = (changes: Record<string, StorageChange>, area: string) => {
    if (Object.keys(changes).length)
      for (const l of onChanged.set) l(changes, area);
  };
  const hosts = new Map<string, NativeHostScript>();
  const granted = new Set<string>();
  const sidePanelCalls: ChromeFake["sidePanelCalls"] = {
    open: [],
    behavior: {},
  };

  const deliver = (message: unknown, sender: MessageSender) =>
    new Promise<unknown>((resolve) => {
      let answered = false;
      let waiting = false;
      const sendResponse = (r?: unknown) => {
        if (answered) return;
        answered = true;
        resolve(r);
      };
      for (const listener of onMessage.set) {
        if (listener(structuredClone(message), sender, sendResponse) === true)
          waiting = true;
      }
      if (!waiting && !answered) resolve(undefined);
    });

  const fake: ChromeFake = {
    runtime: {
      id,
      getURL: (path) => base + path.replace(/^\//, ""),
      // From an extension page by default. Like Chrome, it fails when
      // nothing is listening at all.
      sendMessage: (message) =>
        onMessage.set.size
          ? deliver(message, { id, url: `${base}page.html` })
          : Promise.reject(
              new Error(
                "Could not establish connection. Receiving end does not exist.",
              ),
            ),
      onMessage: onMessage.event,
      connectNative(name) {
        const script = hosts.get(name);
        const fromHost = listeners<(m: unknown) => void>();
        const disconnected = listeners<() => void>();
        let open = true;
        const end = () => {
          if (!open) return;
          open = false;
          queueMicrotask(() => disconnected.set.forEach((l) => l()));
        };
        const port: Port = {
          postMessage(message) {
            if (!open)
              throw new Error("Attempting to use a disconnected port object");
            if (!script) return end();
            queueMicrotask(() =>
              script(
                structuredClone(message) as Record<string, unknown>,
                (reply) =>
                  open &&
                  fromHost.set.forEach((l) => l(structuredClone(reply))),
                { disconnect: end },
              ),
            );
          },
          disconnect() {
            open = false; // the extension's side: no onDisconnect for its own disconnect
          },
          onMessage: fromHost.event,
          onDisconnect: disconnected.event,
        };
        return port;
      },
    },
    storage: {
      local: storageArea("local", fire),
      session: storageArea("session", fire),
      onChanged: onChanged.event,
    },
    scripting: {
      async executeScript({ func, args }) {
        // Like Chrome: the function goes as source, so one that leans on
        // anything outside itself fails here too, and the arguments are copied.
        const run = new Function(`return (${func.toString()})`)() as (
          ...a: unknown[]
        ) => unknown;
        return [{ result: await run(...structuredClone(args || [])) }] as never;
      },
    },
    sidePanel: {
      async open(options) {
        sidePanelCalls.open.push(options);
      },
      async close() {},
      async setPanelBehavior(behavior) {
        sidePanelCalls.behavior = { ...behavior };
      },
      async getPanelBehavior() {
        return { ...sidePanelCalls.behavior };
      },
    },
    windows: {
      async getCurrent() {
        return { id: 1 };
      },
      async create() {
        return {};
      },
    },
    permissions: {
      async contains({ origins = [], permissions = [] }) {
        return [...origins, ...permissions].every((p) => granted.has(p));
      },
      async request({ origins = [], permissions = [] }) {
        for (const p of [...origins, ...permissions]) granted.add(p);
        return true;
      },
      async remove({ origins = [], permissions = [] }) {
        for (const p of [...origins, ...permissions]) granted.delete(p);
        return true;
      },
    },
    commands: {
      async getAll() {
        return [{ name: "_execute_action", shortcut: "Alt+Shift+S" }];
      },
    },
    deliver,
    pageSender: (path = "page.html") => ({ id, url: base + path }),
    contentSender: (tabId, url = "https://example.com/") => ({
      id,
      url,
      tab: { id: tabId, url, windowId: 1 },
    }),
    nativeHost: (name, script) => void hosts.set(name, script),
    sidePanelCalls,
    granted,
    uninstall() {
      delete (globalThis as { chrome?: unknown }).chrome;
    },
  };
  (globalThis as { chrome?: unknown }).chrome = fake;
  return fake;
}
