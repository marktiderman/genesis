import path from "node:path";
import { expect } from "@jest/globals";
import { renderRouter, waitFor, type RenderRouterResult } from "expo-router/testing-library";
import { resetSupabase } from "./fake-supabase";

/** The starter's real route tree: root layout, GenesisNativeApp, tabs and screens, unchanged. */
export const APP_DIR = path.resolve(__dirname, "../../src/app");

/**
 * Renders the whole app at `url`, signed in as `email` (or signed out with `null`).
 * `script` runs after the fakes are reset and before the first render.
 */
export function renderApp(url: string, email: string | null, script?: () => void): Promise<RenderRouterResult> {
  resetSupabase(email);
  script?.();
  return renderRouter(APP_DIR, { initialUrl: url });
}

/** Waits until the router is at `pathname` (a redirect or navigation lands a render later). */
export async function expectPathname(app: RenderRouterResult, pathname: string): Promise<void> {
  await waitFor(() => expect(app.getPathname()).toBe(pathname));
}
