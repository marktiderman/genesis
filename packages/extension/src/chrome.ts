/**
 * The parts of the `chrome.*` extension APIs this package uses, typed here so
 * it needs no `@types/chrome`. `getChrome()` reads the live global each time,
 * so tests can install a fake (see `@marktiderman/genesis-extension/testing`).
 */

export interface MessageSender {
  id?: string;
  url?: string;
  origin?: string;
  /** 0 for a tab's top frame; a framed extension page or content script in a subframe has its own. */
  frameId?: number;
  tab?: { id?: number; url?: string; windowId?: number };
}

export interface Event<Listener extends (...args: never[]) => unknown> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}

export type MessageListener = (
  message: unknown,
  sender: MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export interface Port {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: Event<(message: unknown) => void>;
  onDisconnect: Event<() => void>;
}

export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface Tab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
  active?: boolean;
}

export interface ChromeLike {
  runtime: {
    id: string;
    lastError?: { message?: string };
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: Event<MessageListener>;
    connectNative?(application: string): Port;
  };
  storage: {
    local: StorageArea;
    session?: StorageArea;
    onChanged: Event<
      (changes: Record<string, StorageChange>, areaName: string) => void
    >;
  };
  scripting?: {
    executeScript<Args extends unknown[], Result>(injection: {
      target: { tabId: number };
      func: (...args: Args) => Result;
      args?: Args;
    }): Promise<{ result?: Awaited<Result> }[]>;
  };
  sidePanel?: {
    open(options: { windowId?: number; tabId?: number }): Promise<void>;
    close?(options: { windowId?: number; tabId?: number }): Promise<void>;
    setPanelBehavior(behavior: {
      openPanelOnActionClick?: boolean;
    }): Promise<void>;
    getPanelBehavior?(): Promise<{ openPanelOnActionClick?: boolean }>;
    setOptions?(options: {
      path?: string;
      enabled?: boolean;
      tabId?: number;
    }): Promise<void>;
  };
  windows?: {
    getCurrent(): Promise<{ id?: number }>;
    create(options: {
      url: string;
      type?: string;
      width?: number;
      height?: number;
    }): Promise<unknown>;
  };
  permissions?: {
    contains(permissions: {
      origins?: string[];
      permissions?: string[];
    }): Promise<boolean>;
    request(permissions: {
      origins?: string[];
      permissions?: string[];
    }): Promise<boolean>;
    remove(permissions: {
      origins?: string[];
      permissions?: string[];
    }): Promise<boolean>;
  };
  commands?: {
    getAll(): Promise<
      { name?: string; shortcut?: string; description?: string }[]
    >;
  };
}

/** The extension APIs (`globalThis.chrome`); throws outside an extension. */
export function getChrome(): ChromeLike {
  const api = (globalThis as { chrome?: ChromeLike }).chrome;
  if (!api?.runtime?.id) {
    throw new Error(
      "genesis-extension: chrome.* isn't available here (not an extension context).",
    );
  }
  return api;
}
