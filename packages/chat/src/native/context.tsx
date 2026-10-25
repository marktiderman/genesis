/**
 * @feat:chat
 * What the native screens share: the native modules the app passed, the copy,
 * and how to name and picture a person (the chat schema stores user ids only;
 * names and avatars are the app's, from its own profiles).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveChatCopy, type ChatNativeCopy, type ChatNativeCopyOverrides } from "./copy";
import type { ChatNativeModules } from "./modules";

export interface ChatPerson {
  name: string;
  avatarUrl?: string | null;
}

export interface ChatNativeContextValue {
  modules: ChatNativeModules;
  copy: ChatNativeCopy;
  /** A person's name and picture, or undefined while it isn't known. */
  person(userId: string | null | undefined): ChatPerson | undefined;
}

const EMPTY_MODULES: ChatNativeModules = Object.freeze({});
const DEFAULT: ChatNativeContextValue = { modules: EMPTY_MODULES, copy: resolveChatCopy(), person: () => undefined };
const Context = createContext<ChatNativeContextValue>(DEFAULT);

export interface ChatNativeProviderProps {
  /** Define at module scope: a new object every render re-renders every chat screen. */
  modules?: ChatNativeModules;
  copy?: ChatNativeCopyOverrides;
  /** Names and avatars, from the app's profiles (a cached query is fine). */
  getPerson?: (userId: string) => ChatPerson | undefined;
  children: ReactNode;
}

/** Inside `ChatProvider` (from `/react`). Optional: without it there are no native extras and people are "Someone". */
export function ChatNativeProvider({ modules = EMPTY_MODULES, copy, getPerson, children }: ChatNativeProviderProps) {
  const value = useMemo<ChatNativeContextValue>(
    () => ({ modules, copy: resolveChatCopy(copy), person: (id) => (id && getPerson ? getPerson(id) : undefined) }),
    [modules, copy, getPerson],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChatNative(): ChatNativeContextValue {
  return useContext(Context);
}

/** "SA" for "Sam Altman", "S" for "sam". */
export function initials(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
}
