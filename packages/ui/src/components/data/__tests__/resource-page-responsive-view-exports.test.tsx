/**
 * ResourcePage — a responsive default view, and the slot types on `/data`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import {
  ResourcePage,
  ConfirmDeleteDialog,
  type ResourcePageSlots,
  type ResourcePageSlotMap,
  type ResourcePageSlotProps,
  type ResourceDeleteConfirmCopy,
} from "../index";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}
const posts: Post[] = [{ id: "1", title: "Hello" }];

function mockViewport(mobile: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: mobile,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function renderPosts() {
  return render(
    <GenesisProvider mock={{ datasets: { posts } }}>
      <ResourcePage<Post>
        resource="posts"
        title="Posts"
        columns={["title"]}
        defaultView={{ mobile: "grid", desktop: "table" }}
      />
    </GenesisProvider>,
  );
}

describe("ResourcePage — defaultView { mobile, desktop }", () => {
  it("shows cards on a phone without storing that as the user's choice", async () => {
    mockViewport(true);
    renderPosts();
    await waitFor(() => expect(screen.getByTestId("resource-card")).toBeTruthy());
    expect(document.querySelector("table")).toBeNull();
    expect(localStorage.getItem("genesis-view-choice-posts")).toBeNull();
  });

  it("shows the table on a desktop", async () => {
    mockViewport(false);
    renderPosts();
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
  });

  it("persists the view once the user actually switches", async () => {
    mockViewport(true);
    renderPosts();
    await waitFor(() => expect(screen.getByTestId("resource-card")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
    expect(localStorage.getItem("genesis-view-choice-posts")).toBe("table");
  });
});

describe("`/data` exports the slot types", () => {
  it("lets an app type its slots without reaching into ResourcePageProps", () => {
    // Compile-time contract; the runtime half just proves the module shape.
    const slots: ResourcePageSlots<Post> = { filters: null, deleteDialog: ConfirmDeleteDialog };
    const slotProps: ResourcePageSlotProps<Post> = { table: { pageSize: 10 } };
    const copy: ResourceDeleteConfirmCopy<Post> = { title: (p) => `Delete ${p.title}?` };
    type DetailProps = ResourcePageSlotMap<Post>["detail"];
    const detail: Partial<DetailProps> = { subtitle: "x" };
    expect(slots.filters).toBeNull();
    expect(slotProps.table?.pageSize).toBe(10);
    expect(typeof copy.title).toBe("function");
    expect(detail.subtitle).toBe("x");
  });
});
