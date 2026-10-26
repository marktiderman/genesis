"use client";

/**
 * The words Genesis UI's own components show and announce, in one place, so
 * an app can reword or translate them. The same shape as the support and
 * chat packages' copy: an English catalogue, overrides that replace any part
 * of it (what you leave out stays English), and `{name}` placeholders.
 *
 * ```tsx
 * <UiMessagesProvider messages={{ data: { loadMore: "Mehr laden" } }}>
 *   <App />
 * </UiMessagesProvider>
 * ```
 *
 * Props that already name a piece of copy (`createLabel`, `emptyMessage`,
 * `confirmDelete.title`, …) still win over the catalogue.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { uiMessages, type UiMessages } from "./messages-en";

export { uiMessages, type UiMessages };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Any part of the catalogue. */
export type UiMessagesOverrides = DeepPartial<UiMessages>;

function merge(base: Record<string, unknown>, over: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!over) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    const current = base[key];
    out[key] =
      current && typeof current === "object" && value && typeof value === "object"
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out;
}

/** The catalogue with overrides merged over the English. */
export function resolveUiMessages(overrides?: UiMessagesOverrides): UiMessages {
  return merge(
    uiMessages as unknown as Record<string, unknown>,
    overrides as Record<string, unknown> | undefined,
  ) as unknown as UiMessages;
}

/** Fills `{name}` placeholders; an unknown placeholder is left as written. */
export function fillMessage(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    values[name] !== undefined ? String(values[name]) : token,
  );
}

const MessagesContext = createContext<UiMessages>(uiMessages);

/**
 * Rewords or translates Genesis UI's components below it. Nested providers
 * build on the one above, so a section can change a few words.
 */
export function UiMessagesProvider({
  messages,
  children,
}: {
  messages: UiMessagesOverrides;
  children: ReactNode;
}) {
  const parent = useContext(MessagesContext);
  const value = useMemo(
    () =>
      merge(
        parent as unknown as Record<string, unknown>,
        messages as Record<string, unknown>,
      ) as unknown as UiMessages,
    [parent, messages],
  );
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

/** The catalogue in effect: English unless a `UiMessagesProvider` says otherwise. */
export function useUiMessages(): UiMessages {
  return useContext(MessagesContext);
}
