/**
 * ResourcePage — `loading` / `error` / `errorMessage` / `onRetry` in
 * server-data mode.
 *
 * The defect this locks out: ResourcePage hard-coded its loading and error
 * flags to `false` outside client-side mode, so a server-driven page whose
 * fetch had failed rendered as an ordinary empty table — the page showed
 * nothing and said nothing was wrong. The assertion that matters most here
 * is the negative one: an errored page must NOT render a bare empty table.
 *
 * Client-side mode is asserted too, because these props are purely additive
 * and a `resource`-driven page must keep reading the hook's own state.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

const serverPage: Post[] = [
  { id: "1", title: "Alpha" },
  { id: "2", title: "Mike" },
];

beforeEach(() => {
  localStorage.clear();
});

function renderServerPage(extra: Partial<ResourcePageProps<Post>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Post>
        title="Posts"
        data={serverPage}
        total={97}
        columns={["title"]}
        detail="none"
        page={2}
        perPage={2}
        onPageChange={() => {}}
        {...extra}
      />
    </GenesisProvider>,
  );
}

const loader = () => document.querySelector('[data-testid="page-loader"]');
const table = () => document.querySelector("table");
const rows = () => document.querySelectorAll("tbody tr");
const errorPanel = () => screen.queryByText("Something went wrong");

describe("ResourcePage — server-data fetch state", () => {
  it("shows the loading skeleton while `loading` is true", async () => {
    renderServerPage({ loading: true, data: [] });
    await waitFor(() => expect(loader()).toBeTruthy());
    expect(table()).toBeNull();
    expect(errorPanel()).toBeNull();
  });

  it("shows the error state when `error` is true", async () => {
    renderServerPage({ error: true, data: [] });
    await waitFor(() => expect(errorPanel()).toBeTruthy());
    expect(loader()).toBeNull();
  });

  it("does NOT render an errored page as a bare empty table", async () => {
    renderServerPage({ error: true, data: [] });
    await waitFor(() => expect(errorPanel()).toBeTruthy());
    // The regression: an empty table plus an "0 records" empty state, with
    // nothing anywhere saying the fetch failed.
    expect(table()).toBeNull();
    expect(rows().length).toBe(0);
  });

  it("hides stale rows behind the error state rather than showing them silently", async () => {
    renderServerPage({ error: true });
    await waitFor(() => expect(errorPanel()).toBeTruthy());
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("renders `errorMessage` in place of the generic copy", async () => {
    renderServerPage({ error: true, errorMessage: "Upstream 503" });
    await waitFor(() =>
      expect(screen.queryByText("Upstream 503")).toBeTruthy(),
    );
  });

  it("offers Retry only when `onRetry` is supplied, and calls it", async () => {
    const { unmount } = renderServerPage({ error: true });
    await waitFor(() => expect(errorPanel()).toBeTruthy());
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    unmount();

    const onRetry = vi.fn();
    renderServerPage({ error: true, onRetry });
    await waitFor(() => expect(errorPanel()).toBeTruthy());
    const button = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the rows normally when neither prop is supplied", async () => {
    renderServerPage();
    await waitFor(() => expect(rows().length).toBe(2));
    expect(loader()).toBeNull();
    expect(errorPanel()).toBeNull();
  });

  it("renders the rows normally when both props are explicitly false", async () => {
    renderServerPage({ loading: false, error: false });
    await waitFor(() => expect(rows().length).toBe(2));
    expect(errorPanel()).toBeNull();
  });
});

describe("ResourcePage — client-side mode is unaffected", () => {
  /**
   * `loading` / `error` are read only outside client-side mode. A
   * `resource`-driven page that is handed `error` must still show its own
   * (successful) rows — otherwise these props would be a new way to break
   * every existing consumer that happens to spread a props object.
   */
  it("ignores `error` and keeps rendering the resource's rows", async () => {
    render(
      <GenesisProvider
        mock={{ datasets: { posts: [{ id: "1", title: "Hello" }] } }}
      >
        <ResourcePage
          title="Posts"
          resource="posts"
          columns={["title"]}
          detail="none"
          error
          loading
        />
      </GenesisProvider>,
    );

    await waitFor(() => expect(screen.queryByText("Hello")).toBeTruthy());
    expect(errorPanel()).toBeNull();
  });
});
