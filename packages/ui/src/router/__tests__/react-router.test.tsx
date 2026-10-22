// @feat:router-adapters
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { createRef, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import {
  ReactRouterLink,
  useReactRouterActivePath,
  useReactRouterNavigate,
  useReactRouterSearchParams,
} from "../react-router";
import type { NavigateFn, SearchParamsAdapter } from "../../navigation";

function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{`${pathname}${search}${hash}`}</output>;
}

function renderAt(initial: string, element: ReactNode) {
  const router = createMemoryRouter(
    [{ path: "*", element: <>{element}<Where /></> }],
    { initialEntries: [initial] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const where = () => screen.getByTestId("where").textContent;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReactRouterLink", () => {
  it("renders an anchor with the full href and forwards testID, aria and class", () => {
    renderAt(
      "/",
      <ReactRouterLink
        href="/admin?tab=users#top"
        testID="nav-admin"
        className="nav"
        aria-current="page"
        aria-label="Admin"
        title="Admin"
      >
        Admin
      </ReactRouterLink>,
    );
    const link = screen.getByTestId("nav-admin");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/admin?tab=users#top");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("aria-label")).toBe("Admin");
    expect(link.getAttribute("title")).toBe("Admin");
    expect(link.className).toBe("nav");
    expect(link.hasAttribute("testID")).toBe(false);
  });

  it("navigates client-side, keeping query and hash, and still calls onClick", () => {
    const onClick = vi.fn();
    renderAt(
      "/",
      <ReactRouterLink href="/settings?x=1#profile" testID="go" onClick={onClick}>
        Settings
      </ReactRouterLink>,
    );
    fireEvent.click(screen.getByTestId("go"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(where()).toBe("/settings?x=1#profile");
  });

  it("never sets aria-current on its own", () => {
    renderAt("/items", <ReactRouterLink href="/items" testID="items">Items</ReactRouterLink>);
    expect(screen.getByTestId("items").hasAttribute("aria-current")).toBe(false);
  });
});

describe("useReactRouterNavigate", () => {
  it("navigates in-app paths through the router", () => {
    let navigate!: NavigateFn;
    function Grab() {
      navigate = useReactRouterNavigate();
      return null;
    }
    renderAt("/", <Grab />);
    act(() => navigate("/items/42?tab=notes#n1"));
    expect(where()).toBe("/items/42?tab=notes#n1");
  });

  it("hands absolute URLs to the browser instead of the router", () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as Location);
    let navigate!: NavigateFn;
    function Grab() {
      navigate = useReactRouterNavigate();
      return null;
    }
    renderAt("/start", <Grab />);
    act(() => navigate("https://example.com/x"));
    expect(assign).toHaveBeenCalledWith("https://example.com/x");
    expect(where()).toBe("/start");
  });
});

describe("useReactRouterSearchParams", () => {
  it("reads the current query and writes updates through the router, keeping path and hash", () => {
    let adapter!: SearchParamsAdapter;
    function Grab() {
      adapter = useReactRouterSearchParams();
      return null;
    }
    const router = renderAt("/items?status=open#list", <Grab />);
    expect(adapter.searchParams.get("status")).toBe("open");

    act(() => adapter.setSearchParams(new URLSearchParams("status=done&page=2")));
    expect(where()).toBe("/items?status=done&page=2#list");
    expect(adapter.searchParams.get("page")).toBe("2");
    expect(router.state.historyAction).toBe("PUSH");

    act(() =>
      adapter.setSearchParams(new URLSearchParams(), { replace: true }),
    );
    expect(where()).toBe("/items#list");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});

describe("useReactRouterActivePath", () => {
  it("returns pathname + search + hash", () => {
    function Show() {
      return <span data-testid="active">{useReactRouterActivePath()}</span>;
    }
    renderAt("/admin?tab=users#top", <Show />);
    expect(screen.getByTestId("active").textContent).toBe("/admin?tab=users#top");
  });
});

describe("ReactRouterLink under a Radix asChild parent", () => {
  it("forwards ref, merged props and data-testid, and still navigates", () => {
    const ref = createRef<HTMLAnchorElement>();
    renderAt("/", 
      <Button asChild variant="ghost" ref={ref as never}>
        <ReactRouterLink href="/clients" testID="back-link">
          Back
        </ReactRouterLink>
      </Button>,
    );
    const link = screen.getByTestId("back-link");
    expect(link.tagName).toBe("A");
    expect(ref.current).toBe(link);
    expect(link.getAttribute("data-slot")).toBe("button");
    expect(link.className).toContain("inline-flex");
    fireEvent.click(link);
    expect(where()).toBe("/clients");
  });

  it("keeps a data-testid the parent merged in when no testID is given", () => {
    renderAt("/", 
      <Button asChild data-testid="from-parent">
        <ReactRouterLink href="/x">X</ReactRouterLink>
      </Button>,
    );
    expect(screen.getByTestId("from-parent").tagName).toBe("A");
  });
});
