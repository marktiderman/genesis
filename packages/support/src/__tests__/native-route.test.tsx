// @feat:support-route-mount
// Zone-aware native routes: which screen a path is, links that stay in the zone, and SupportRoute.
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { inZone, stripZone, supportPaths, supportScreenOf, zoneOf } from "..";
import { createSupport, SupportRoute } from "../native";
import { fakeSupabase } from "./fake-supabase";

const ZONES = ["/admin", "/coach", "/admin/deep"];

describe("zones", () => {
  it("finds the longest zone a path is in", () => {
    expect(zoneOf("/admin/account/support", ZONES)).toBe("/admin");
    expect(zoneOf("/admin/deep/x", ZONES)).toBe("/admin/deep");
    expect(zoneOf("/administer", ZONES)).toBe("");
    expect(zoneOf("/account/support?x=1", ZONES)).toBe("");
    expect(zoneOf("/coach", ZONES)).toBe("/coach");
  });

  it("takes a zone off and puts one on", () => {
    expect(stripZone("/coach/account/support/new", ZONES)).toBe("/account/support/new");
    expect(stripZone("/account/support", ZONES)).toBe("/account/support");
    expect(inZone("/account/support/ideas", "/coach")).toBe("/coach/account/support/ideas");
    expect(inZone("/coach/account/support/ideas", "/coach")).toBe("/coach/account/support/ideas");
    expect(inZone("/account/support", "")).toBe("/account/support");
  });
});

describe("which screen a path is", () => {
  const base = "/account/support";
  const at = (p: string) => supportScreenOf(p, base, ZONES);
  it("reads every support screen, in any zone", () => {
    expect(at("/account/support")).toEqual({ name: "inbox" });
    expect(at("/admin/account/support/")).toEqual({ name: "inbox" });
    expect(at("/coach/account/support/new")).toEqual({ name: "feedback" });
    expect(at("/account/support/r%201")).toEqual({ name: "thread", id: "r 1" });
    expect(at("/account/support/ideas")).toEqual({ name: "ideas" });
    expect(at("/account/support/shipped")).toEqual({ name: "shipped" });
    expect(at("/account/support/home")).toEqual({ name: "home" });
    expect(at("/account/support/message")).toEqual({ name: "message" });
    expect(at("/account/support/help?q=reset")).toEqual({ name: "help" });
    expect(at("/admin/account/support/help/reset-password")).toEqual({ name: "article", slug: "reset-password" });
    expect(at("/account/support/agent")).toEqual({ name: "agent" });
    expect(at("/account/support/agent/t1")).toEqual({ name: "agentThread", id: "t1" });
  });

  it("is null outside support, or deeper than a screen", () => {
    expect(at("/account")).toBeNull();
    expect(at("/account/supportive")).toBeNull();
    expect(at("/account/support/help/a/b")).toBeNull();
    expect(at("/account/support/ideas/x")).toBeNull();
  });

  it("matches the block's own paths", () => {
    const paths = supportPaths(base);
    expect(at(paths.thread("t9"))).toEqual({ name: "thread", id: "t9" });
    expect(at(paths.article("a b"))).toEqual({ name: "article", slug: "a b" });
    expect(at(paths.agentThread("t2"))).toEqual({ name: "agentThread", id: "t2" });
  });
});

function mount(path: string, node: ReactNode, extra: { Screen?: (p: { options?: Record<string, unknown> }) => null } = {}) {
  const fake = fakeSupabase({ userId: "00000000-0000-4000-8000-0000000000a1", rpc: () => ({ data: [], error: null }) });
  const navigate = vi.fn();
  const block = createSupport({
    supabase: fake.client,
    navigate,
    platform: "ios",
    basePath: "/account/support",
    zones: ZONES,
    useCurrentRoute: () => path,
    router: { ...(extra.Screen ? { Screen: extra.Screen } : {}), useSearchParams: () => ({ q: "reset" }) },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <block.Root>{node}</block.Root>
    </QueryClientProvider>,
  );
  return { block, navigate };
}

describe("SupportRoute", () => {
  it("keeps support's links in the zone the person is in", async () => {
    const { block, navigate } = mount("/coach/account/support", null);
    await waitFor(() => expect(block.zone()).toBe("/coach"));
    block.options.navigate(block.paths.ideas);
    expect(navigate).toHaveBeenCalledWith("/coach/account/support/ideas");
  });

  it("renders the app's own screen with what the path names", () => {
    const Thread = vi.fn(({ screen: s }: { screen: { name: string; id?: string } }) => <span>{`thread ${s.id}`}</span>);
    mount("/admin/account/support/t7", <SupportRoute screens={{ thread: Thread }} />);
    expect(screen.getByText("thread t7")).toBeTruthy();
  });

  it("passes the search params on", () => {
    const Help = vi.fn(({ params }: { params: Record<string, unknown> }) => <span>{`q=${String(params["q"])}`}</span>);
    mount("/account/support/help", <SupportRoute screens={{ help: Help }} />);
    expect(screen.getByText("q=reset")).toBeTruthy();
  });

  it("renders Genesis's screen, with its header, when the app has none of its own", async () => {
    const Screen = vi.fn((_: { options?: Record<string, unknown> }) => null);
    mount("/admin/account/support/ideas", <SupportRoute />, { Screen });
    await waitFor(() => expect(Screen).toHaveBeenCalled());
    expect(Screen.mock.calls[0]?.[0].options).toMatchObject({ title: "Idea board" });
  });

  it("shows notFound for a path that is no support screen", () => {
    mount("/account/settings", <SupportRoute notFound={<span>nothing here</span>} />);
    expect(screen.getByText("nothing here")).toBeTruthy();
  });
});

describe("SupportRoute and the settings", () => {
  it("is notFound for a screen the settings turn off, and offers the contact", () => {
    const fake = fakeSupabase({ userId: "00000000-0000-4000-8000-0000000000a1", rpc: () => ({ data: [], error: null }) });
    const block = createSupport({
      supabase: fake.client,
      navigate: vi.fn(),
      platform: "ios",
      basePath: "/account/support",
      useCurrentRoute: () => "/account/support/agent",
      appSettings: { "support.agentDesk": false, "support.contactEmail": "help@acme.test" },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <block.Root>
          <SupportRoute notFound={<span>agent desk off</span>} />
        </block.Root>
      </QueryClientProvider>,
    );
    expect(screen.getByText("agent desk off")).toBeTruthy();
    expect(block.contact()).toEqual({ email: "help@acme.test", url: null });
  });
});

describe("hostile paths and addresses", async () => {
  const { supportContact } = await import("..");
  it("stay linear: a path of many slashes, an address of many @s", () => {
    const start = performance.now();
    expect(zoneOf("/admin" + "/".repeat(50_000) + "x", ZONES)).toBe("/admin");
    expect(supportScreenOf("/account/support" + "/".repeat(50_000), "/account/support")).toEqual({ name: "inbox" });
    expect(supportContact({ "support.contactEmail": "a@".repeat(20_000) + "x" })).toBeNull();
    expect(performance.now() - start).toBeLessThan(200);
    expect(supportContact({ "support.contactEmail": "help@acme.test" })).toEqual({ email: "help@acme.test", url: null });
  });
});

describe("CodeRabbit follow-ups on routes", async () => {
  const { isUnderPath, supportContact, mailtoHref } = await import("..");
  it("reads a thread named like an Object method as a thread", () => {
    expect(supportScreenOf("/support/constructor", "/support")).toEqual({ name: "thread", id: "constructor" });
    expect(supportScreenOf("/support/__proto__", "/support")).toEqual({ name: "thread", id: "__proto__" });
  });

  it("checks a path at a segment boundary", () => {
    expect(isUnderPath("/support-plans", "/support")).toBe(false);
    expect(isUnderPath("/support/ideas", "/support")).toBe(true);
    expect(isUnderPath("/support?x", "/support")).toBe(true);
  });

  it("puts the zone in front of a basePath that starts like the zone", async () => {
    const fake = fakeSupabase({ userId: "00000000-0000-4000-8000-0000000000a1", rpc: () => ({ data: [], error: null }) });
    const navigate = vi.fn();
    const block = createSupport({ supabase: fake.client, navigate, platform: "ios", basePath: "/admin/support", zones: ["/admin"], useCurrentRoute: () => "/admin/admin/support" });
    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><block.Root>{null}</block.Root></QueryClientProvider>);
    await waitFor(() => expect(block.zone()).toBe("/admin"));
    block.options.navigate(block.paths.help);
    expect(navigate).toHaveBeenCalledWith("/admin/admin/support/help");
  });

  it("keeps the zone of a path the route file passes itself", async () => {
    const fake = fakeSupabase({ userId: "00000000-0000-4000-8000-0000000000a1", rpc: () => ({ data: [], error: null }) });
    const navigate = vi.fn();
    const block = createSupport({ supabase: fake.client, navigate, platform: "ios", basePath: "/support", zones: ["/coach"] });
    const Ideas = () => <span>ideas</span>;
    render(<QueryClientProvider client={new QueryClient()}><block.Root><SupportRoute path="/coach/support/ideas" screens={{ ideas: Ideas }} /></block.Root></QueryClientProvider>);
    await waitFor(() => expect(block.zone()).toBe("/coach"));
    block.options.navigate(block.paths.shipped);
    expect(navigate).toHaveBeenCalledWith("/coach/support/shipped");
  });

  it("lets an ideas option the app gave win over the setting", () => {
    const fake = fakeSupabase({ userId: "00000000-0000-4000-8000-0000000000a1", rpc: () => ({ data: [], error: null }) });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", basePath: "/support", ideas: true, appSettings: { "support.ideas": false }, useCurrentRoute: () => "/support/ideas" });
    render(<QueryClientProvider client={new QueryClient()}><block.Root><SupportRoute screens={{ ideas: () => <span>board</span> }} /></block.Root></QueryClientProvider>);
    expect(screen.getByText("board")).toBeTruthy();
  });

  it("offers a support page only with a host, and encodes the mailbox", () => {
    expect(supportContact({ "support.contactUrl": "https://?", "support.contactEmail": "help@acme.test" })).toEqual({ email: "help@acme.test", url: null });
    expect(supportContact({ "support.contactUrl": "https://acme.test/help" })).toEqual({ email: null, url: "https://acme.test/help" });
    expect(mailtoHref("help?desk@acme.test")).toBe("mailto:help%3Fdesk@acme.test");
    expect(mailtoHref("help@acme.test")).toBe("mailto:help@acme.test");
  });
});
