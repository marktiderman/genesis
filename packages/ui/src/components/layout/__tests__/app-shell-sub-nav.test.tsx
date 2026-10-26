// @feat:app-shell
/**
 * Shell sub-navigation: a page's child items (a form's Questions / Logic and
 * endings / Responses / Settings). Opt-in: with no `subNav` set the shell
 * renders exactly as before ("section"). "tabs" and "sidebar" turn it on,
 * including the phone bar's back item; "off" hides the children.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ClipboardList, GitBranch, Home, Inbox, ListChecks, Settings, Users } from "lucide-react";

import { AppShell, type AppShellProps, type NavItem } from "../AppShell";
import { AppShellPageHeader, AppShellSubNavEnd, useAppShellSubNav } from "../sub-nav";
import type { NavigationNode } from "../../../navigation";

const legacy = { showThemeToggle: false, configurable: false };
const chrome = { ...legacy, subNav: "tabs" as const };

const formTabs: NavItem[] = [
  { to: "/forms/$formId/edit", icon: ListChecks, label: "Questions", badge: 2 },
  { to: "/forms/$formId/edit/logic", icon: GitBranch, label: "Logic and endings", badge: 1 },
  { to: "/forms/$formId/edit/responses", icon: Inbox, label: "Responses", badge: 2 },
  { to: "/forms/$formId/edit/settings", icon: Settings, label: "Settings" },
];

const tree: NavigationNode<NavItem> = {
  id: "app",
  path: "/",
  label: "Home",
  items: [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/forms", icon: ClipboardList, label: "Forms" },
  ],
  children: [
    {
      id: "forms",
      path: "/forms",
      label: "Forms",
      items: [],
      children: [{ id: "form", path: "/forms/$formId/edit", label: "Form", items: formTabs }],
    },
  ],
};

function renderShell(activePath: string, props: Partial<AppShellProps> = {}) {
  return render(
    <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath={activePath} {...props}>
      {props.children ?? <div>content</div>}
    </AppShell>,
  );
}

const tabs = () => within(screen.getByTestId("app-shell-sub-nav"));
const sidebar = () => within(screen.getByTestId("app-shell-sidebar"));
const bottomBar = () => within(screen.getByRole("navigation", { name: "Primary" }));
const currentIn = (scope: ReturnType<typeof within>) =>
  scope
    .getAllByRole("link")
    .filter((a: HTMLElement) => a.getAttribute("aria-current") === "page")
    .map((a: HTMLElement) => a.textContent);

beforeEach(() => {
  localStorage.clear();
});

describe("sub-navigation: default is the legacy section (opt-in)", () => {
  const renderLegacy = (path: string) => renderShell(path, { options: legacy });

  it("renders no tab row, keeps the labelled sidebar section", () => {
    renderLegacy("/forms/f1/edit/logic");
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    const section = sidebar().getByTestId("app-shell-contextual-nav");
    expect(within(section).getByText("Form")).toBeTruthy();
    // Its own section straight under the nav, after the global items, not
    // nested in a wrapper with Forms.
    expect(section.parentElement?.getAttribute("aria-label")).toBe("Main");
    expect(section.previousElementSibling?.textContent).toBe("Forms");
  });

  it("puts the children in the phone bar as before: no back item, no badge chips", () => {
    renderLegacy("/forms/f1/edit");
    expect(screen.queryByTestId("app-shell-mobile-back")).toBeNull();
    const links = bottomBar().getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Questions",
      "Logic and endings",
      "Responses",
      "Settings",
    ]);
    expect(links[0]!.textContent).toBe("Questions");
  });
});

describe("sub-navigation: tabs", () => {
  it("renders the children as navigation links across the top of the content", () => {
    renderShell("/forms/f1/edit");
    const nav = screen.getByRole("navigation", { name: "Form" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/forms/f1/edit",
      "/forms/f1/edit/logic",
      "/forms/f1/edit/responses",
      "/forms/f1/edit/settings",
    ]);
    // Badges as chips, inside the link.
    expect(links[0]!.textContent).toBe("Questions2");
    expect(currentIn(tabs())).toEqual(["Questions2"]);
    // Not duplicated in the sidebar; the section stays highlighted there but
    // leaves aria-current to the tab.
    expect(sidebar().queryByTestId("app-shell-contextual-nav")).toBeNull();
    const forms = sidebar().getByRole("link", { name: "Forms" });
    expect(forms.className).toContain("text-sidebar-primary");
    expect(currentIn(sidebar())).toEqual([]);
  });

  it("marks only the most specific tab current", () => {
    renderShell("/forms/f1/edit/logic");
    expect(currentIn(tabs())).toEqual(["Logic and endings1"]);
  });

  it("takes the active tab from the search string", () => {
    const byQuery: NavigationNode<NavItem> = {
      ...tree,
      children: [
        {
          id: "form",
          path: "/forms/$formId",
          label: "Form",
          items: [
            { to: "/forms/$formId?tab=questions", icon: ListChecks, label: "Questions" },
            { to: "/forms/$formId?tab=responses", icon: Inbox, label: "Responses" },
          ],
        },
      ],
    };
    renderShell("/forms/f1?tab=responses", { navigation: byQuery });
    expect(currentIn(tabs())).toEqual(["Responses"]);
  });

  it("renders a host slot at the right of the row", () => {
    renderShell("/forms/f1/edit", {
      children: (
        <AppShellSubNavEnd>
          <span>Ready to publish</span>
        </AppShellSubNavEnd>
      ),
    });
    expect(tabs().getByText("Ready to publish")).toBeTruthy();
  });

  it("renders no row on a page without children", () => {
    renderShell("/clients");
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
  });
});

describe("sub-navigation from the page: useAppShellSubNav", () => {
  function FormPage({ responses }: { responses: number }) {
    useAppShellSubNav([
      { to: "/forms/f1/edit", label: "Questions", badge: 5, end: true },
      { to: "/forms/f1/edit/responses", label: "Responses", badge: responses },
    ]);
    return <div>form</div>;
  }

  it("replaces the node's items with live badges, and falls back when unmounted", () => {
    function Harness() {
      const [show, setShow] = useState(true);
      const [count, setCount] = useState(3);
      return (
        <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/forms/f1/edit">
          {show ? <FormPage responses={count} /> : null}
          <button type="button" onClick={() => setCount((c) => c + 1)}>more</button>
          <button type="button" onClick={() => setShow(false)}>leave</button>
        </AppShell>
      );
    }
    render(<Harness />);
    expect(tabs().getAllByRole("link").map((a) => a.textContent)).toEqual(["Questions5", "Responses3"]);
    fireEvent.click(screen.getByText("more"));
    expect(tabs().getByRole("link", { name: /Responses/ }).textContent).toBe("Responses4");
    fireEvent.click(screen.getByText("leave"));
    // Back to the tree's four items.
    expect(tabs().getAllByRole("link")).toHaveLength(4);
  });

  it("lets the page choose its own mode", () => {
    function SidebarPage() {
      useAppShellSubNav([{ to: "/clients/c1", label: "Profile" }], { mode: "sidebar" });
      return null;
    }
    renderShell("/clients/c1", { children: <SidebarPage /> });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    expect(sidebar().getByRole("group").textContent).toContain("Profile");
  });

  it("the innermost caller wins, and badge updates never flip it", () => {
    function Layout({ children }: { children: ReactNode }) {
      const [n, setN] = useState(1);
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Layout tab", badge: n, end: true }]);
      return (
        <>
          <button type="button" onClick={() => setN((v) => v + 1)}>layout badge</button>
          {children}
        </>
      );
    }
    function Page() {
      const [n, setN] = useState(1);
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Page tab", badge: n, end: true }]);
      return <button type="button" onClick={() => setN((v) => v + 1)}>page badge</button>;
    }
    render(
      <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/forms/f1/edit">
        <Layout>
          <Page />
        </Layout>
      </AppShell>,
    );
    const labels = () => tabs().getAllByRole("link").map((a: HTMLElement) => a.textContent);
    expect(labels()).toEqual(["Page tab1"]);
    fireEvent.click(screen.getByText("layout badge"));
    expect(labels()).toEqual(["Page tab1"]);
    fireEvent.click(screen.getByText("page badge"));
    expect(labels()).toEqual(["Page tab2"]);
    fireEvent.click(screen.getByText("layout badge"));
    expect(labels()).toEqual(["Page tab2"]);
  });

  it("a page mounted later under a mounted layout still wins", () => {
    function Layout({ children }: { children: ReactNode }) {
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Layout tab", end: true }]);
      return <>{children}</>;
    }
    function Page() {
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Page tab", end: true }]);
      return null;
    }
    function Harness() {
      const [show, setShow] = useState(false);
      return (
        <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/forms/f1/edit">
          <Layout>{show ? <Page /> : null}</Layout>
          <button type="button" onClick={() => setShow(true)}>open page</button>
        </AppShell>
      );
    }
    render(<Harness />);
    expect(tabs().getByRole("link").textContent).toBe("Layout tab");
    fireEvent.click(screen.getByText("open page"));
    expect(tabs().getByRole("link").textContent).toBe("Page tab");
  });

  it("keeps the mode when items are null, and falls back to the node's items", () => {
    function ModeOnly() {
      useAppShellSubNav(null, { mode: "sidebar" });
      return null;
    }
    // App default is legacy "section"; the page turns sidebar mode on.
    renderShell("/forms/f1/edit/logic", { options: legacy, children: <ModeOnly /> });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    const group = sidebar().getByRole("group", { name: "Form" });
    expect(within(group).getAllByRole("link")).toHaveLength(4);
    // Nested under Forms (sidebar mode), and phones get the back item.
    expect(group.parentElement?.getAttribute("aria-label")).not.toBe("Main");
    expect(screen.getByTestId("app-shell-mobile-back")).toBeTruthy();
  });

  it("does nothing outside an AppShell", () => {
    function Lonely() {
      useAppShellSubNav([{ to: "/x", label: "X" }]);
      return <p>alone</p>;
    }
    render(<Lonely />);
    expect(screen.getByText("alone")).toBeTruthy();
  });
});

describe("sub-navigation: sidebar", () => {
  it("nests the children under the active item", () => {
    renderShell("/forms/f1/edit/responses", { subNav: "sidebar" });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    const group = sidebar().getByRole("group", { name: "Form" });
    // Directly under the Forms row.
    const forms = sidebar().getByRole("link", { name: "Forms" });
    expect(group.parentElement).toBe(forms.parentElement);
    expect(currentIn(within(group))).toEqual(["Responses2"]);
  });

  it("shows them in a flyout from the active item on the collapsed rail", () => {
    renderShell("/forms/f1/edit", { subNav: "sidebar", collapsed: true });
    fireEvent.click(screen.getByTestId("nav-rail-group-Forms"));
    const flyout = screen.getByTestId("nav-rail-popover-Forms");
    expect(within(flyout).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Forms",
      "Questions2",
      "Logic and endings1",
      "Responses2",
      "Settings",
    ]);
    expect(currentIn(within(flyout))).toEqual(["Questions2"]);
  });

  it("can be set on the navigation node", () => {
    const perNode: NavigationNode<NavItem> = {
      ...tree,
      children: [{ ...tree.children![0]!, children: [{ ...tree.children![0]!.children![0]!, subNav: "sidebar" }] }],
    };
    renderShell("/forms/f1/edit", { navigation: perNode });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    expect(sidebar().getByRole("group", { name: "Form" })).toBeTruthy();
  });
});

describe("sub-navigation: off", () => {
  it("renders nothing on desktop and keeps the main bar on phones", () => {
    renderShell("/forms/f1/edit", { options: { ...chrome, subNav: "off" } });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    expect(screen.queryByTestId("app-shell-contextual-nav")).toBeNull();
    expect(bottomBar().getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Clients", "Forms"]);
    expect(screen.queryByTestId("app-shell-mobile-back")).toBeNull();
  });
});

describe("phone bar vs an app-wide mobileNavItems", () => {
  const appBar: NavItem[] = [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/forms", icon: ClipboardList, label: "Forms" },
  ];

  it("tabs / sidebar: a page's children win on that page, mobileNavItems elsewhere", () => {
    for (const mode of ["tabs", "sidebar"] as const) {
      const { unmount, rerender } = renderShell("/forms/f1/edit", { subNav: mode, mobileNavItems: appBar });
      expect(bottomBar().getAllByRole("link").map((a: HTMLElement) => a.getAttribute("aria-label"))).toEqual([
        "Back to Forms",
        "Questions (2)",
        "Logic and endings (1)",
        "Responses (2)",
        "Settings",
      ]);
      rerender(
        <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/clients" subNav={mode} mobileNavItems={appBar}>
          <div>content</div>
        </AppShell>,
      );
      expect(bottomBar().getAllByRole("link").map((a: HTMLElement) => a.textContent)).toEqual(["Home", "Forms"]);
      unmount();
    }
  });

  it("the page's hook children win too", () => {
    function Page() {
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Only tab", end: true }]);
      return null;
    }
    renderShell("/forms/f1/edit", { mobileNavItems: appBar, children: <Page /> });
    expect(bottomBar().getAllByRole("link").map((a: HTMLElement) => a.getAttribute("aria-label"))).toEqual([
      "Back to Forms",
      "Only tab",
    ]);
  });

  it("section / off: mobileNavItems still wins, as before", () => {
    for (const mode of ["section", "off"] as const) {
      const { unmount } = renderShell("/forms/f1/edit", { subNav: mode, mobileNavItems: appBar });
      expect(bottomBar().getAllByRole("link").map((a: HTMLElement) => a.textContent)).toEqual(["Home", "Forms"]);
      expect(screen.queryByTestId("app-shell-mobile-back")).toBeNull();
      unmount();
    }
  });
});

describe("hideOnPhone", () => {
  it("leaves an item out of the phone bar but keeps it in the tab row", () => {
    function Page() {
      useAppShellSubNav([
        { to: "/forms/f1/edit", label: "Questions" },
        { to: "/forms/f1/edit/logic", label: "Logic and endings", hideOnPhone: true },
        { to: "/forms/f1/edit/responses", label: "Responses" },
      ]);
      return null;
    }
    renderShell("/forms/f1/edit/logic", { subNav: "tabs", children: <Page /> });
    expect(tabs().getAllByRole("link").map((a: HTMLElement) => a.textContent)).toEqual([
      "Questions",
      "Logic and endings",
      "Responses",
    ]);
    expect(bottomBar().getAllByRole("link").map((a: HTMLElement) => a.getAttribute("aria-label") ?? a.textContent)).toEqual([
      "Back to Forms",
      "Questions",
      "Responses",
    ]);
    // The hidden panel's parent tab shows as current on the phone bar.
    const current = bottomBar()
      .getAllByRole("link")
      .filter((a: HTMLElement) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute("aria-label") ?? current[0]!.textContent).toMatch(/Questions$/);
  });
});

describe("sub-navigation on phones", () => {
  it("switches the bottom bar to the children, led by a back item to the parent", () => {
    renderShell("/forms/f1/edit/logic");
    const links = bottomBar().getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Back to Forms",
      "Questions (2)",
      "Logic and endings (1)",
      "Responses (2)",
      "Settings",
    ]);
    expect(links[0]!.getAttribute("href")).toBe("/forms");
    expect(links.filter((a) => a.getAttribute("aria-current") === "page")).toEqual([links[2]]);
  });

  it("does the same in sidebar mode (phones ignore the mode)", () => {
    renderShell("/forms/f1/edit", { subNav: "sidebar" });
    expect(screen.getByTestId("app-shell-mobile-back").getAttribute("aria-label")).toBe("Back to Forms");
  });

  it("brings the app's main bar back on leaving", () => {
    const { rerender } = renderShell("/forms/f1/edit");
    expect(screen.getByTestId("app-shell-mobile-back")).toBeTruthy();
    rerender(
      <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/forms">
        <div>content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("app-shell-mobile-back")).toBeNull();
    expect(bottomBar().getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Clients", "Forms"]);
  });

  it("shows the label's first letter for a page's item without an icon", () => {
    function Page() {
      useAppShellSubNav([{ to: "/forms/f1/edit", label: "Questions", badge: 2, end: true }]);
      return null;
    }
    renderShell("/forms/f1/edit", { children: <Page /> });
    const questions = bottomBar().getByRole("link", { name: "Questions (2)" });
    expect(questions.textContent).toBe("Q2Questions");
  });
});

describe("page header slot: AppShellPageHeader", () => {
  const header = () => screen.getByTestId("app-shell-page-header");
  const Title = ({ text }: { text: string }) => (
    <AppShellPageHeader>
      <h1>{text}</h1>
    </AppShellPageHeader>
  );

  it("renders the page's header above the tab row, with the page content below", () => {
    renderShell("/forms/f1/edit", { children: <><Title text="E2E Saturday check-in" /><p>body</p></> });
    const title = screen.getByRole("heading", { name: "E2E Saturday check-in" });
    expect(header().contains(title)).toBe(true);
    const row = screen.getByTestId("app-shell-sub-nav");
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(screen.getByText("body")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stays visible on phones while the bottom bar shows back plus the children", () => {
    renderShell("/forms/f1/edit", { children: <Title text="Form" /> });
    expect(header().className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByTestId("app-shell-mobile-back")).toBeTruthy();
  });

  it("the innermost header wins over a layout's, and keeps winning as it updates", () => {
    function Page() {
      const [n, setN] = useState(1);
      return (
        <>
          <Title text={`Page ${n}`} />
          <button type="button" onClick={() => setN((v) => v + 1)}>bump</button>
        </>
      );
    }
    renderShell("/forms/f1/edit", {
      children: (
        <>
          <Title text="Layout" />
          <Page />
        </>
      ),
    });
    expect(within(header()).getAllByRole("heading").map((h: HTMLElement) => h.textContent)).toEqual(["Page 1"]);
    fireEvent.click(screen.getByText("bump"));
    expect(within(header()).getAllByRole("heading").map((h: HTMLElement) => h.textContent)).toEqual(["Page 2"]);
  });

  it("falls back to the layout's header when the page's unmounts", () => {
    function Harness() {
      const [page, setPage] = useState(true);
      return (
        <AppShell appName="Riverside Gym" navigation={tree} options={chrome} activePath="/forms/f1/edit">
          <Title text="Layout" />
          {page ? <Title text="Page" /> : null}
          <button type="button" onClick={() => setPage(false)}>leave</button>
        </AppShell>
      );
    }
    render(<Harness />);
    expect(within(header()).getByRole("heading").textContent).toBe("Page");
    fireEvent.click(screen.getByText("leave"));
    expect(within(header()).getByRole("heading").textContent).toBe("Layout");
  });

  it("adds no markup when no header is mounted", () => {
    renderShell("/forms/f1/edit");
    expect(screen.queryByTestId("app-shell-page-header")).toBeNull();
  });

  it("sits at the top of the content in the default section mode", () => {
    renderShell("/forms/f1/edit", { options: legacy, children: <><Title text="Form" /><p>body</p></> });
    expect(screen.queryByTestId("app-shell-sub-nav")).toBeNull();
    const title = screen.getByRole("heading", { name: "Form" });
    expect(header().contains(title)).toBe(true);
    expect(title.compareDocumentPosition(screen.getByText("body")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders only the innermost end-slot chip too", () => {
    renderShell("/forms/f1/edit", {
      children: (
        <>
          <AppShellSubNavEnd><span>layout chip</span></AppShellSubNavEnd>
          <div><AppShellSubNavEnd><span>page chip</span></AppShellSubNavEnd></div>
        </>
      ),
    });
    expect(tabs().queryByText("layout chip")).toBeNull();
    expect(tabs().getByText("page chip")).toBeTruthy();
  });
});
