import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  useRouterState,
  type AnyRouter,
} from "@tanstack/react-router";
import { createRef, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Circle as Icon } from "lucide-react";
import {
  TanStackRouterLink,
  useTanStackRouterActivePath,
  useTanStackRouterNavigate,
  useTanStackRouterSearchParams,
} from "../tanstack-router";
import { AppShell } from "../../components/layout/AppShell";
import type { NavigateFn, SearchParamsAdapter } from "../../navigation";

function Where() {
  const href = useRouterState({ select: (s) => s.location.href });
  return <output data-testid="where">{href}</output>;
}

async function renderAt(initial: string, element: ReactNode) {
  // A single splat-free root route renders for every path, which is all the
  // adapters need: they never depend on the app's route tree.
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {element}
        <Where />
      </>
    ),
  });
  const router: AnyRouter = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByTestId("where");
  return router;
}

const where = () => screen.getByTestId("where").textContent;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TanStackRouterLink", () => {
  it("builds the href from path, query and hash and forwards testID, aria and class", async () => {
    await renderAt(
      "/",
      <TanStackRouterLink
        href="/admin?tab=users#top"
        testID="nav-admin"
        className="nav"
        aria-label="Admin"
        title="Admin"
      >
        Admin
      </TanStackRouterLink>,
    );
    const link = screen.getByTestId("nav-admin");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/admin?tab=users#top");
    expect(link.getAttribute("aria-label")).toBe("Admin");
    expect(link.getAttribute("title")).toBe("Admin");
    expect(link.className).toBe("nav");
    expect(link.hasAttribute("testID")).toBe(false);
  });

  it("parses the query with the router's own parseSearch, so values round-trip", async () => {
    const router = await renderAt(
      "/",
      <TanStackRouterLink href="/items?tag=a&tag=b&page=2" testID="items">
        Items
      </TanStackRouterLink>,
    );
    const href = screen.getByTestId("items").getAttribute("href")!;
    // Whatever the router's serializer writes, reading it back gives the
    // same values the original query parses to (no `"2"`-vs-`2` drift).
    expect(router.options.parseSearch(href.slice(href.indexOf("?")))).toEqual(
      router.options.parseSearch("?tag=a&tag=b&page=2"),
    );
    expect(new URLSearchParams(href.split("?")[1]).get("page")).toBe("2");
  });

  it("navigates client-side and still calls onClick", async () => {
    const onClick = vi.fn();
    await renderAt(
      "/",
      <TanStackRouterLink href="/settings#profile" testID="go" onClick={onClick}>
        Settings
      </TanStackRouterLink>,
    );
    fireEvent.click(screen.getByTestId("go"));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(where()).toBe("/settings#profile"));
  });

  it("leaves the active state to Genesis: no router aria-current, data-status or active class", async () => {
    await renderAt(
      "/app/clients",
      <>
        {/* TanStack's prefix match calls /app active here; Genesis did not. */}
        <TanStackRouterLink href="/app" testID="app">App</TanStackRouterLink>
        <TanStackRouterLink href="/app/clients" testID="clients" aria-current="page">
          Clients
        </TanStackRouterLink>
      </>,
    );
    const app = screen.getByTestId("app");
    expect(app.hasAttribute("aria-current")).toBe(false);
    expect(app.hasAttribute("data-status")).toBe(false);
    expect(app.className).toBe("");
    expect(screen.getByTestId("clients").getAttribute("aria-current")).toBe("page");
  });

  it("renders absolute URLs as a plain anchor", async () => {
    await renderAt(
      "/",
      <TanStackRouterLink href="https://example.com/docs?a=1" testID="ext">
        Docs
      </TanStackRouterLink>,
    );
    expect(screen.getByTestId("ext").getAttribute("href")).toBe(
      "https://example.com/docs?a=1",
    );
  });

  it("drives AppShell with exactly one current item", async () => {
    function Shell() {
      return (
        <AppShell
          appName="Test"
          navItems={[
            { to: "/app", icon: Icon, label: "Home", end: true },
            { to: "/app/clients", icon: Icon, label: "Clients" },
          ]}
          linkComponent={TanStackRouterLink}
          activePath={useTanStackRouterActivePath()}
        >
          content
        </AppShell>
      );
    }
    await renderAt("/app/clients", <Shell />);
    // AppShell renders the nav more than once (rail, drawer); every copy
    // must agree, and the prefix-matching "/app" must never be current.
    const current = [...document.querySelectorAll('[aria-current="page"]')];
    expect(current.length).toBeGreaterThan(0);
    expect(new Set(current.map((el) => el.textContent?.trim()))).toEqual(
      new Set(["Clients"]),
    );
    expect(document.querySelector("[data-status]")).toBeNull();
  });
});

describe("useTanStackRouterNavigate", () => {
  it("navigates in-app paths through the router", async () => {
    let navigate!: NavigateFn;
    function Grab() {
      navigate = useTanStackRouterNavigate();
      return null;
    }
    await renderAt("/", <Grab />);
    await act(async () => navigate("/items/42?tab=notes#n1"));
    await waitFor(() => expect(where()).toBe("/items/42?tab=notes#n1"));
  });

  it("hands absolute URLs to the browser instead of the router", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as Location);
    let navigate!: NavigateFn;
    function Grab() {
      navigate = useTanStackRouterNavigate();
      return null;
    }
    await renderAt("/start", <Grab />);
    await act(async () => navigate("mailto:hi@example.com"));
    expect(assign).toHaveBeenCalledWith("mailto:hi@example.com");
    expect(where()).toBe("/start");
  });
});

describe("useTanStackRouterSearchParams", () => {
  it("reads the current query and writes updates through the router, keeping path and hash", async () => {
    let adapter!: SearchParamsAdapter;
    function Grab() {
      adapter = useTanStackRouterSearchParams();
      return null;
    }
    const router = await renderAt("/items?status=open#list", <Grab />);
    expect(adapter.searchParams.get("status")).toBe("open");
    const lengthBefore = router.history.length;

    await act(async () =>
      adapter.setSearchParams(new URLSearchParams("status=done&page=2")),
    );
    await waitFor(() => expect(adapter.searchParams.get("status")).toBe("done"));
    expect(adapter.searchParams.get("page")).toBe("2");
    expect(router.state.location.pathname).toBe("/items");
    expect(router.state.location.hash).toBe("list");
    expect(router.history.length).toBe(lengthBefore + 1);

    await act(async () =>
      adapter.setSearchParams(new URLSearchParams(), { replace: true }),
    );
    await waitFor(() => expect(where()).toBe("/items#list"));
    expect(router.history.length).toBe(lengthBefore + 1);
  });
});

describe("useTanStackRouterActivePath", () => {
  it("returns pathname + search + hash", async () => {
    function Show() {
      return <span data-testid="active">{useTanStackRouterActivePath()}</span>;
    }
    await renderAt("/admin?tab=users#top", <Show />);
    expect(screen.getByTestId("active").textContent).toBe("/admin?tab=users#top");
  });
});

describe("TanStackRouterLink under a Radix asChild parent", () => {
  it("forwards ref, merged props and data-testid, and still navigates", async () => {
    const ref = createRef<HTMLAnchorElement>();
    await renderAt("/", 
      <Button asChild variant="ghost" ref={ref as never}>
        <TanStackRouterLink href="/clients" testID="back-link">
          Back
        </TanStackRouterLink>
      </Button>,
    );
    const link = screen.getByTestId("back-link");
    expect(link.tagName).toBe("A");
    expect(ref.current).toBe(link);
    expect(link.getAttribute("data-slot")).toBe("button");
    expect(link.className).toContain("inline-flex");
    fireEvent.click(link);
    await waitFor(() => expect(where()).toBe("/clients"));
  });

  it("keeps a data-testid the parent merged in when no testID is given", async () => {
    await renderAt("/", 
      <Button asChild data-testid="from-parent">
        <TanStackRouterLink href="/x">X</TanStackRouterLink>
      </Button>,
    );
    expect(screen.getByTestId("from-parent").tagName).toBe("A");
  });
});
