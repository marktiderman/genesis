/**
 * The slot contract — `slots`, `slotProps` and the eject button.
 *
 * What these lock out is not a rendering bug, it is a shape: a pattern
 * component that can only be taken whole. When one interior part is wrong for
 * a surface, the surface's only options were "accept it" or "fork the page",
 * and forking is what actually happened — a downstream app grew its own copy
 * of the header because it needed one more action in it.
 *
 * So the assertions here are about REACH, and each one is the negative of a
 * fork: can a consumer replace one part and keep the rest wired; can it pass
 * one part an attribute without replacing it; can it drop a part it does not
 * want. A hatch that exists but does not actually reach the rendered tree is
 * worse than none, because the consumer only finds out at runtime.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";
import { DataBulkBar } from "../DataBulkBar";
import { Trash2 } from "lucide-react";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

const rows: Post[] = [
  { id: "1", title: "Alpha" },
  { id: "2", title: "Bravo" },
];

beforeEach(() => {
  localStorage.clear();
});

function renderPage(extra: Partial<ResourcePageProps<Post>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Post>
        title="Posts"
        data={rows}
        total={rows.length}
        columns={["title"]}
        {...extra}
      />
    </GenesisProvider>,
  );
}

describe("ResourcePage — slots", () => {
  it("replaces a part with the consumer's own component", () => {
    renderPage({
      slots: {
        filters: () => <div data-testid="my-filters">mine</div>,
      },
    });

    expect(screen.getByTestId("my-filters")).toBeTruthy();
  });

  it("hands the replacement the props it would have given the default", () => {
    const seen = vi.fn();
    renderPage({
      searchPlaceholder: "Find a post…",
      slots: {
        filters: (props) => {
          seen(props.searchPlaceholder);
          return null;
        },
      },
    });

    // This is what makes a slot cheaper than a fork: the replacement can be a
    // wrapper that renders the default with one thing changed, because it
    // receives the fully-wired prop set rather than having to rebuild it.
    expect(seen).toHaveBeenCalledWith("Find a post…");
  });

  it("ejects a part entirely with null", () => {
    renderPage({
      bulkActions: [{ label: "Delete", onAction: () => {} }],
      slots: { bulkBar: null },
    });

    expect(screen.queryByText("Delete")).toBeNull();
    // The rest of the page is untouched — ejecting one part is not leaving.
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("still renders the default part when no override is given", () => {
    renderPage();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
  });
});

describe("ResourcePage — slotProps", () => {
  it("passes extra props to a part it is KEEPING", () => {
    renderPage({
      slotProps: { filters: { searchPlaceholder: "Overridden" } },
    });

    expect(screen.getByPlaceholderText("Overridden")).toBeTruthy();
  });

  it("wins over the value ResourcePage itself computed", () => {
    // A hatch that silently loses to the default is not a hatch: the consumer
    // sets the prop, sees no change, and goes back to forking.
    renderPage({
      searchPlaceholder: "From the page prop",
      slotProps: { filters: { searchPlaceholder: "From slotProps" } },
    });

    expect(screen.getByPlaceholderText("From slotProps")).toBeTruthy();
    expect(screen.queryByPlaceholderText("From the page prop")).toBeNull();
  });

  it("merges className onto the shell rather than replacing its layout", () => {
    const { container } = renderPage({ className: "my-page-class" });
    const root = container.querySelector(".my-page-class");

    expect(root).toBeTruthy();
    // `space-y-6` is the shell's own layout — a consumer adding a class must
    // not silently delete it.
    expect(root?.className).toContain("space-y-6");
  });
});

describe("DataBulkBar — testId", () => {
  it("puts data-testid on the action button", () => {
    render(
      <DataBulkBar
        selected={new Set(["1"])}
        totalCount={2}
        onToggleAll={() => {}}
        onClearSelection={() => {}}
        actions={[
          {
            label: "Delete",
            icon: Trash2,
            onClick: () => {},
            testId: "bulk-delete",
          },
        ]}
      />,
    );

    expect(screen.getByTestId("bulk-delete")).toBeTruthy();
  });
});
