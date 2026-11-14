// @feat:view-types
/**
 * View types and record pages (ADR 0021): ResourceView dispatches `type` through the registry (an
 * app's own type too, `mode` as its alias, the gallery its own type), and a record opens the way
 * the view says (side peek, center peek, page) from the list, the board and the calendar, with a
 * peek drawing the view's record view (standard or document template) when it names one.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineRecordView, defineView, type AnyRecordView } from "@marktiderman/genesis-core/resource-view";
import { defineViewType, listViewTypes, RecordPeek, registerViewType, resolveViewType, ResourceView, useViewList, type ResourceViewProps } from "../resource-view";
import { detailMode, recordOpen } from "../resource-view/open-modes";

type Note = { id: string; title: string; stage: "draft" | "done"; day: string; cover: string | null; emoji: string | null; body: string | null; photo: string | null };

const notes = defineResource<Note>()({
  name: "notes",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["draft", "done"] },
    { name: "day", type: "datetime", dbType: "date" },
    { name: "cover", type: "string", nullable: true },
    { name: "emoji", type: "string", nullable: true },
    { name: "body", type: "string", control: "textarea", nullable: true },
    { name: "photo", type: "string", nullable: true },
  ],
});

const ROWS: Note[] = [
  { id: "a", title: "Plan the trip", stage: "draft", day: "2026-11-03", cover: "https://example.com/c.jpg", emoji: "🧭", body: "Pack light.\nBring a map.", photo: "https://example.com/a.jpg" },
  { id: "b", title: "Book the hut", stage: "done", day: "2026-11-04", cover: null, emoji: null, body: null, photo: null },
];

const matches = (row: Note, f: FilterParam) => {
  const v = row[f.field as keyof Note] as unknown;
  if (f.operator === "eq") return v === f.value;
  if (f.operator === "gte") return String(v) >= String(f.value);
  if (f.operator === "lt") return String(v) < String(f.value);
  return true;
};

function provider(): DataProvider {
  const rows = ROWS.map((r) => ({ ...r }));
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const data = rows.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      return { data, total: data.length };
    }),
    getOne: vi.fn(async (_r: string, { id }: { id: string }) => ({ data: rows.find((r) => r.id === id) })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}

function wrap(p: DataProvider = provider()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const plain = defineView(notes, { board: { field: "stage" }, calendar: { field: "day" }, gallery: { image: "photo" } });

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
  vi.restoreAllMocks();
});

describe("the view-type registry", () => {
  it("has Genesis's six types and draws an app's own by name", async () => {
    expect(listViewTypes().filter((t) => t.builtIn).map((t) => t.id)).toEqual(["table", "list", "grid", "gallery", "board", "calendar"]);
    function Timeline(props: ResourceViewProps) {
      const list = useViewList(props.view);
      return <ol data-testid="timeline">{list.rows.map((r) => <li key={String(r.id)}>{String(r.title)}</li>)}</ol>;
    }
    const timeline = defineViewType({ id: "timeline", render: Timeline });
    expect(timeline.label).toBe("Timeline");
    unregister = registerViewType(timeline);
    expect(resolveViewType("timeline")).toBe(timeline);
    render(<ResourceView view={plain} type="timeline" />, { wrapper: wrap() });
    await waitFor(() => expect(within(screen.getByTestId("timeline")).getByText("Book the hut")).toBeTruthy());
  });

  it("refuses a bad id, a taken one and a built-in, and names the registered ones for an unknown type", () => {
    expect(() => defineViewType({ id: "Time Line", render: () => null })).toThrow(/lowercase/);
    const one = defineViewType({ id: "map", render: () => null });
    unregister = registerViewType(one);
    expect(() => registerViewType(defineViewType({ id: "map", render: () => null }))).toThrow(/already registered/);
    expect(() => registerViewType(defineViewType({ id: "board", render: () => null }))).toThrow(/built-in/);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceView view={plain} type="nope" />, { wrapper: wrap() })).toThrow(/no view type "nope"; registered: table, list, grid, gallery, board, calendar, map/);
  });

  it("takes `type` over its alias `mode`, and gallery as its own type", async () => {
    const { unmount } = render(<ResourceView view={plain} type="board" mode="table" />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getByTestId("resource-board")).toBeTruthy());
    unmount();
    render(<ResourceView view={plain} type="gallery" />, { wrapper: wrap() });
    await waitFor(() => expect(document.querySelector('[data-slot="gallery"]')).not.toBeNull());
  });

  it("asks for a gallery block with type=gallery", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceView view={defineView(notes)} type="gallery" />, { wrapper: wrap() })).toThrow(/needs a gallery block/);
  });
});

describe("open modes", () => {
  it("map ResourcePage's detail words both ways", () => {
    expect(detailMode("side-peek")).toBe("panel");
    expect(detailMode("center-peek")).toBe("modal");
    expect(detailMode("page")).toBe("route");
    expect(detailMode("none")).toBe("none");
    expect(recordOpen("modal")).toBe("center-peek");
    expect(recordOpen("route")).toBe("page");
  });

  it("a board opens a card the view's way: a center peek, or its page", async () => {
    const centered = defineView(notes, { board: { field: "stage" }, open: "center-peek" });
    const { unmount } = render(<ResourceView view={centered} type="board" />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByTestId("resource-board-card").length).toBe(2));
    fireEvent.click(screen.getAllByTestId("resource-board-card")[0]!);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    unmount();
    const navigate = vi.fn();
    render(<ResourceView view={centered} type="board" open="page" onNavigate={navigate} />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByTestId("resource-board-card").length).toBe(2));
    fireEvent.click(screen.getAllByTestId("resource-board-card")[0]!);
    expect(navigate).toHaveBeenCalledWith("/notes/a");
  });

  it("a calendar honours the screen's open too", async () => {
    const navigate = vi.fn();
    render(<ResourceView view={plain} type="calendar" calendar={{ anchor: "2026-11-03" }} open="page" onNavigate={navigate} />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByText("Plan the trip").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("Plan the trip")[0]!);
    expect(navigate).toHaveBeenCalledWith("/notes/a");
  });
});

describe("record pages in a peek", () => {
  const withRecord = defineView(notes, { board: { field: "stage" }, recordView: (): AnyRecordView => noteRecord });
  const noteRecord = defineRecordView(withRecord, {
    template: "document",
    sections: [
      { id: "about", label: "About" },
      { id: "links", label: "Links" },
    ],
    document: { cover: "cover", icon: "emoji", properties: ["stage", "day"], body: "body" },
  });

  it("a board's peek draws the view's record view, document template and all", async () => {
    render(<ResourceView view={withRecord} type="board" />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByTestId("resource-board-card").length).toBe(2));
    fireEvent.click(screen.getAllByTestId("resource-board-card").find((c) => c.textContent?.includes("Plan the trip"))!);
    await waitFor(() => expect(screen.getByTestId("record-peek")).toBeTruthy());
    const page = document.querySelector('[data-slot="record-page"]')!;
    expect(page.getAttribute("data-template")).toBe("document");
    expect(page.getAttribute("data-presentation")).toBe("peek");
    expect(document.querySelector('[data-slot="record-peek"]')?.getAttribute("data-open")).toBe("side-peek");
    expect(document.querySelector('[data-slot="record-page-title"]')?.textContent).toBe("Plan the trip");
    expect(document.querySelector('[data-slot="record-page-icon"]')?.textContent).toBe("🧭");
    expect(document.querySelector('[data-slot="record-page-cover"] img')?.getAttribute("src")).toBe("https://example.com/c.jpg");
    expect(document.querySelector('[data-slot="record-page-body"]')?.textContent).toBe("Pack light.\nBring a map.");
    const props = within(document.querySelector('[data-slot="record-page-properties"]') as HTMLElement);
    expect(props.getByText("Stage")).toBeTruthy();
    expect(props.getByText("Draft")).toBeTruthy();
  });

  it("switches sections in place, with no route", async () => {
    render(
      <RecordPeek view={noteRecord} row={ROWS[0]!} open onClose={() => {}} mode="center-peek" slots={{ about: <p>About it</p>, links: <p>Some links</p> }} />,
      { wrapper: wrap() },
    );
    expect(screen.getByText("About it")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("record-peek-page-section-links"));
    await waitFor(() => expect(screen.getByText("Some links")).toBeTruthy());
    expect(document.querySelector('[data-slot="record-peek"]')?.getAttribute("data-open")).toBe("center-peek");
  });

  it("a list's peek opens the record view too", async () => {
    render(<ResourceView view={withRecord} type="list" />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getAllByText("Book the hut").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("Book the hut")[0]!);
    await waitFor(() => expect(document.querySelector('[data-slot="record-peek"]')).not.toBeNull());
    // Its row's cover is empty, so no cover is drawn.
    expect(document.querySelector('[data-slot="record-page-cover"]')).toBeNull();
  });
});
