// ---------------------------------------------------------------------------
// The page's window, when there is one to listen to.
//
// `typeof window !== "undefined"` is not enough: React Native defines
// `window` as its global object, and on Hermes that object has no
// `addEventListener`. A page-unload listener added behind that check alone
// throws "undefined is not a function" on the phone. Ask this instead.
// ---------------------------------------------------------------------------

export type PageWindow = Pick<Window, "addEventListener" | "removeEventListener">;

/** The browser window, or undefined where there is none (SSR, React Native). */
export function pageWindow(): PageWindow | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Partial<PageWindow> | undefined;
  if (!w || typeof w.addEventListener !== "function" || typeof w.removeEventListener !== "function") {
    return undefined;
  }
  return w as PageWindow;
}
