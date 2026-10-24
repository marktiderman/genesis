// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AuthGate, SessionProvider, createSessionStore, useSession } from "../auth";
import { fakeSupabase } from "./fakes";

describe("createSessionStore", () => {
  it("is loading until the session is read", async () => {
    const { client } = fakeSupabase({ user: { id: "u1" } });
    const store = createSessionStore(client);
    expect(store.getState().status).toBe("loading");
    await store.load();
    expect(store.getState()).toEqual({ status: "signedIn", session: { user: { id: "u1" } } });
  });

  it("throws when Supabase reports an error, so the boot fails", async () => {
    const { client } = fakeSupabase(null, { error: new Error("network") });
    await expect(createSessionStore(client).load()).rejects.toThrow("network");
  });

  it("follows auth events and reports a sign-out only from signed in", async () => {
    const { client, emit, listeners } = fakeSupabase(null);
    const onSignedOut = vi.fn();
    const store = createSessionStore(client, { onSignedOut });
    const stop = store.start();
    await store.load();
    expect(store.getState().status).toBe("signedOut");
    expect(onSignedOut).not.toHaveBeenCalled();
    emit("SIGNED_IN", { user: { id: "u1" } });
    expect(store.getState().status).toBe("signedIn");
    emit("SIGNED_OUT", null);
    expect(store.getState().status).toBe("signedOut");
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("AuthGate and useSession", () => {
  it("renders the tree for the session", async () => {
    const { client, emit } = fakeSupabase(null);
    const store = createSessionStore(client);
    store.start();
    function Who() {
      const { session } = useSession<{ user: { id: string } }>();
      return <span data-testid="who">{session?.user.id ?? "nobody"}</span>;
    }
    render(
      <SessionProvider store={store}>
        <AuthGate loading={<span data-testid="loading" />} signedOut={<span data-testid="out" />} signedIn={<Who />} />
      </SessionProvider>,
    );
    expect(screen.getByTestId("loading")).toBeTruthy();
    await act(() => store.load());
    expect(screen.getByTestId("out")).toBeTruthy();
    act(() => emit("SIGNED_IN", { user: { id: "u1" } }));
    expect(screen.getByTestId("who").textContent).toBe("u1");
  });
});
