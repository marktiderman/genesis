// @feat:native-app-shell
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GenesisNativeAppProps } from "../index";
import { createSessionStore } from "../auth";

describe("the supabase prop", () => {
  it("takes a real SupabaseClient without a cast", async () => {
    // Compile-time check: this line fails typecheck if the shapes drift.
    const fits = (client: SupabaseClient): GenesisNativeAppProps["supabase"] => client;
    const client = createClient("http://localhost:54321", "publishable-key", { auth: { persistSession: false, autoRefreshToken: false } });
    const store = createSessionStore(fits(client));
    await store.load();
    expect(store.getState().status).toBe("signedOut");
  });
});
