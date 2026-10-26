/**
 * @feat:chat
 * Retries unsent messages when there's a chance they'll go now: the app
 * coming back to the front (AppState "active") and, with NetInfo
 * (`modules.netInfo`), the connection coming back, through
 * `useChat().retryAll()`: which messages it resends is the outbox's rule
 * (every failed one whose files are still there). Mount it once under
 * ChatProvider and ChatNativeProvider: `<ChatAutoRetry />`.
 */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useChat } from "../react/index";
import { useChatNative } from "./context";
import type { NetInfoLike } from "./modules";

/** React Native's `AppState`, as the hook uses it. */
export interface AppStateLike {
  currentState: string | null;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export interface ChatAutoRetryOptions {
  /** Default `modules.netInfo`. */
  netInfo?: NetInfoLike;
  /** Default React Native's AppState. */
  appState?: AppStateLike;
}

/** Whether a NetInfo state is online: unknown counts as online, so only a real "offline" waits. */
export function isOnline(state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useChatAutoRetry({ netInfo, appState }: ChatAutoRetryOptions = {}): void {
  const { retryAll } = useChat();
  const { modules } = useChatNative();
  const net = netInfo ?? modules.netInfo;
  const app = appState ?? (AppState as unknown as AppStateLike | undefined);
  // The latest retryAll, so a changing queue doesn't resubscribe.
  const retry = useRef(retryAll);
  retry.current = retryAll;

  useEffect(() => {
    const go = () => void retry.current().catch(() => undefined);
    let last = app?.currentState ?? null;
    const sub = app?.addEventListener?.("change", (next) => {
      if (next === "active" && last !== "active") go();
      last = next;
    });
    // Only a change from offline to online: NetInfo also reports the current state on subscribing.
    let wasOnline: boolean | null = null;
    const unsubscribe = net?.addEventListener((state) => {
      const online = isOnline(state);
      if (online && wasOnline === false) go();
      wasOnline = online;
    });
    return () => {
      sub?.remove();
      unsubscribe?.();
    };
  }, [net, app]);
}

/** `useChatAutoRetry` as a component, for a provider tree. */
export function ChatAutoRetry(props: ChatAutoRetryOptions) {
  useChatAutoRetry(props);
  return null;
}
