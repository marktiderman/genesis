// @feat:native-app-shell
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AuthGate, SessionProvider, createSessionStore, useSession } from "../auth";
import { fakeSupabase, retryableFetchError } from "./fakes";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionStore", () => {
  it("is loading until the session is read", async () => {
    const { client } = fakeSupabase({ user: { id: "u1" } });
    const store = createSessionStore(client);
    expect(store.getState().status).toBe("loading");
    await store.load();
    expect(store.getState()).toMatchObject({ status: "signedIn", userId: "u1", offline: false });
  });

  it("throws on a real auth error, so the boot fails", async () => {
    const { client } = fakeSupabase(null, { error: new Error("invalid refresh token") });
    await expect(createSessionStore(client).load()).rejects.toThrow("invalid refresh token");
  });

  it("offline, a network error uses the stored session instead of failing", async () => {
    const { client } = fakeSupabase(null, { error: retryableFetchError(), stored: { user: { id: "u1" } } });
    const store = createSessionStore(client);
    await store.load();
    expect(store.getState()).toMatchObject({ status: "signedIn", userId: "u1", offline: true });
  });

  it("offline, a getSession stuck on a refresh times out to the stored session", async () => {
    vi.useFakeTimers();
    const { client } = fakeSupabase(null, { hang: true, stored: { user: { id: "u1" } } });
    const store = createSessionStore(client, { waitMs: 3000 });
    const loading = store.load();
    await vi.advanceTimersByTimeAsync(2999);
    expect(store.getState().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    await loading;
    expect(store.getState()).toMatchObject({ status: "signedIn", userId: "u1", offline: true });
  });

  it("offline with nothing stored is signed out", async () => {
    const { client } = fakeSupabase(null, { error: retryableFetchError() });
    const store = createSessionStore(client);
    await store.load();
    expect(store.getState().status).toBe("signedOut");
  });

  it("reports every change of user after the first read: sign-in, account switch, sign-out", async () => {
    const { client, emit, listeners } = fakeSupabase(null);
    const onUserChange = vi.fn();
    const store = createSessionStore(client, { onUserChange });
    const stop = store.start();
    await store.load();
    expect(onUserChange).not.toHaveBeenCalled();
    emit("SIGNED_IN", { user: { id: "a" } });
    emit("TOKEN_REFRESHED", { user: { id: "a" } });
    emit("SIGNED_IN", { user: { id: "b" } });
    emit("SIGNED_OUT", null);
    expect(onUserChange.mock.calls).toEqual([
      [null, "a"],
      ["a", "b"],
      ["b", null],
    ]);
    stop();
    expect(listeners.size).toBe(0);
  });

  it("ignores a slow getSession once an auth event has answered", async () => {
    let resolve!: (value: { data: { session: null }; error: null }) => void;
    const { client, emit } = fakeSupabase(null);
    client.auth.getSession = () => new Promise((r) => (resolve = r));
    const store = createSessionStore(client);
    store.start();
    const loading = store.load();
    emit("INITIAL_SESSION", { user: { id: "u1" } });
    resolve({ data: { session: null }, error: null });
    await loading;
    expect(store.getState().userId).toBe("u1");
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
