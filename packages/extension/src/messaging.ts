import { chrome, type MessageSender } from "./chrome";

/**
 * Messages between an extension's parts, checked by who sent them.
 *
 * An extension's service worker hears from two kinds of sender: its own
 * pages (the popup, panel, options page), which may ask for anything, and
 * the scripts it runs inside web pages, which a hostile page can drive and
 * so may only ask for the few things listed for them. `createRouter` keeps
 * the two apart; a message of a type the sender may not send is ignored.
 *
 * Every message is `{ type, ...payload }`. A handler returns its answer (or
 * a promise of it); a thrown error comes back as `{ error }`, which `request`
 * turns back into a thrown Error on the other side.
 */

export interface Message {
  type: string;
  [key: string]: unknown;
}

export type Handler<Context> = (message: Message, context: Context) => unknown;

export interface PageContext {
  sender: MessageSender;
}

export interface ContentContext {
  sender: MessageSender;
  /** The tab the script runs in: the only tab its handlers should touch. */
  tab: NonNullable<MessageSender["tab"]>;
}

/** Sent by one of this extension's own pages (not a script inside a web page). */
export function isFromExtensionPage(sender: MessageSender): boolean {
  const api = chrome();
  return (
    sender.id === api.runtime.id &&
    (sender.url || "").startsWith(api.runtime.getURL(""))
  );
}

/** Sent by this extension's script inside a web page (a content script). */
export function isFromContentScript(sender: MessageSender): boolean {
  return (
    sender.id === chrome().runtime.id &&
    Boolean(sender.tab) &&
    !isFromExtensionPage(sender)
  );
}

export interface Router {
  /** Stop listening. */
  stop(): void;
}

/**
 * Listen for messages: `pages` handlers answer the extension's own pages,
 * `content` handlers answer its scripts in web pages. Call once, at the top
 * level of the service worker (listeners must be added before it idles).
 */
export function createRouter({
  pages = {},
  content = {},
}: {
  pages?: Record<string, Handler<PageContext>>;
  content?: Record<string, Handler<ContentContext>>;
}): Router {
  const api = chrome();
  const listener = (
    raw: unknown,
    sender: MessageSender,
    sendResponse: (r?: unknown) => void,
  ) => {
    const message = raw as Message;
    if (!message || typeof message.type !== "string") return false;
    let answer: unknown;
    try {
      if (isFromExtensionPage(sender)) {
        const handler = Object.hasOwn(pages, message.type)
          ? pages[message.type]
          : undefined;
        if (!handler) return false;
        answer = handler(message, { sender });
      } else if (isFromContentScript(sender)) {
        const handler = Object.hasOwn(content, message.type)
          ? content[message.type]
          : undefined;
        if (!handler) return false;
        answer = handler(message, { sender, tab: sender.tab! });
      } else return false;
    } catch (err) {
      sendResponse({ error: errorMessage(err) });
      return false;
    }
    if (answer instanceof Promise) {
      answer.then(sendResponse, (err) =>
        sendResponse({ error: errorMessage(err) }),
      );
      return true; // answered later
    }
    sendResponse(answer);
    return false;
  };
  api.runtime.onMessage.addListener(listener);
  return { stop: () => api.runtime.onMessage.removeListener(listener) };
}

/** Ask the service worker; resolves with its answer, throws its error. */
export async function request<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const answer = (await chrome().runtime.sendMessage({ ...payload, type })) as
    { error?: string } | T | undefined;
  if (
    answer &&
    typeof answer === "object" &&
    "error" in answer &&
    typeof answer.error === "string"
  ) {
    throw new Error(answer.error);
  }
  return answer as T;
}

/** Tell every listening page; nobody listening isn't an error. */
export function broadcast(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  return chrome()
    .runtime.sendMessage({ ...payload, type })
    .then(
      () => undefined,
      () => undefined,
    );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
