/**
 * ResourceDetailPage — the data-bound half of the detail template
 * (FRAMEWORK.md step 8).
 *
 * What is worth pinning here is the BINDING, not the page shape: the layout
 * it renders is `DetailPage`, whose structure is already covered in
 * `layout/__tests__/page-templates.test.tsx`.
 *
 * A stub provider is used for the request-shape assertions, where the point
 * IS what arguments went out. It is deliberately NOT used for the
 * missing-record case, because a stub is exactly what made that state look
 * covered while being unreachable: a stub can resolve with empty data, and
 * no provider Genesis ships ever does — all three throw. So the not-found
 * tests drive the REAL `createMockProvider`, plus the verbatim error shapes
 * the Supabase and switchboard providers emit, cited to the line that emits
 * them. If any of those three changes its miss signal, a test here fails
 * rather than the state silently going dead again.
 *
 * The QueryClient is built per test with `retry: false`. The shared
 * `GenesisProvider` used by the sibling tests carries react-query's default
 * three retries with exponential backoff, which turns every error-path test
 * into a seven-second wait for a result that is already known.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataProviderRoot } from "../../../provider";
import type { DataProvider } from "../../../provider";
import { ResourceDetailPage } from "../ResourceDetailPage";

type GetOne = DataProvider["getOne"];

/** Minimal provider: only `getOne` is reachable from this component. */
function stubProvider(getOne: GetOne): DataProvider {
  return { getOne } as unknown as DataProvider;
}

/** A provider whose `getOne` throws — the way a real miss is signalled. */
const rejects = (error: unknown) =>
  vi.fn(async () => {
    throw error;
  }) as unknown as GetOne;

function renderBound(ui: ReactNode, provider: DataProvider) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DataProviderRoot provider={provider}>{ui}</DataProviderRoot>
    </QueryClientProvider>
  );
}

const ada = { id: "1", name: "Ada Lovelace", role: "Principal engineer" };
const resolves = (row: unknown) =>
  vi.fn(async () => ({ data: row })) as unknown as GetOne;

describe("ResourceDetailPage", () => {
  it("fetches the record by id and titles the page with it", async () => {
    const getOne = resolves(ada);
    const { container } = renderBound(
      <ResourceDetailPage resource="people" id="1">
        {(person) => <p>body for {String(person.name)}</p>}
      </ResourceDetailPage>,
      stubProvider(getOne)
    );

    expect(await screen.findByText("body for Ada Lovelace")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ada Lovelace"
    );
    expect(getOne).toHaveBeenCalledWith("people", {
      id: "1",
      select: undefined,
    });
    // It renders the layout half rather than a second page shape.
    expect(container.querySelector('[data-slot="detail-page"]')).not.toBe(null);
  });

  it("hands the record to actions, sidebar and children", async () => {
    const { container } = renderBound(
      <ResourceDetailPage
        resource="people"
        id="1"
        subtitleField="role"
        actions={(person) => <button type="button">Edit {String(person.id)}</button>}
        sidebar={(person) => <dl>owner: {String(person.role)}</dl>}
      >
        {(person) => <p>timeline for {String(person.name)}</p>}
      </ResourceDetailPage>,
      stubProvider(resolves(ada))
    );

    expect(await screen.findByText("timeline for Ada Lovelace")).toBeDefined();
    expect(
      container.querySelector('[data-slot="detail-page-actions"]')?.textContent
    ).toBe("Edit 1");
    expect(
      container.querySelector('[data-slot="detail-page-sidebar"]')?.textContent
    ).toBe("owner: Principal engineer");
    expect(
      container.querySelector('[data-slot="detail-page-subtitle"]')?.textContent
    ).toBe("Principal engineer");
  });

  it("takes the title from titleField exactly, with no silent fallback", async () => {
    renderBound(
      <ResourceDetailPage resource="people" id="1" titleField="role">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(resolves(ada))
    );

    expect(await screen.findByText("body")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Principal engineer"
    );
  });

  it("forwards select to the provider so a detail page can join", async () => {
    const getOne = resolves(ada);
    renderBound(
      <ResourceDetailPage
        resource="people"
        id="1"
        select="*, owner:profiles(name)"
      >
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(getOne)
    );

    expect(await screen.findByText("body")).toBeDefined();
    expect(getOne).toHaveBeenCalledWith("people", {
      id: "1",
      select: "*, owner:profiles(name)",
    });
  });

  it("shows the loading state while the record is in flight", () => {
    const { container } = renderBound(
      <ResourceDetailPage resource="people" id="1">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(
        vi.fn(() => new Promise(() => {})) as unknown as GetOne // never settles
      )
    );

    expect(container.querySelector('[data-slot="page-loading"]')).not.toBe(null);
    expect(container.querySelector('[data-slot="detail-page"]')).toBe(null);
  });

  it("does not fetch at all until the id resolves", () => {
    const getOne = resolves(ada);
    const { container } = renderBound(
      <ResourceDetailPage resource="people" id={undefined}>
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(getOne)
    );

    expect(getOne).not.toHaveBeenCalled();
    // Loading, not "not found": nothing was asked, so nothing is missing.
    expect(container.querySelector('[data-slot="page-loading"]')).not.toBe(null);
    expect(screen.queryByText("Not found")).toBe(null);
  });

  it("surfaces the provider's message when the fetch fails", async () => {
    renderBound(
      <ResourceDetailPage resource="people" id="1">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(
        vi.fn(async () => {
          throw new Error("permission denied for table people");
        }) as unknown as GetOne
      )
    );

    expect(await screen.findByText("Couldn't load this record")).toBeDefined();
    expect(
      screen.getByText("permission denied for table people")
    ).toBeDefined();
  });

  it("reports a miss from the REAL mock provider as not found", async () => {
    // Driven by createMockProvider itself, not a stub: it throws
    // "[MockProvider] Record not found: people#404"
    // (packages/core/src/provider/mock-provider.ts). A stub that resolves
    // empty would pass this test while the shipped behaviour rendered a raw
    // error string, which is exactly how this branch could have gone dead.
    renderBound(
      <ResourceDetailPage resource="people" id="404">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      createMockProvider({ people: [ada] })
    );

    expect(await screen.findByText("Not found")).toBeDefined();
    expect(screen.queryByText("Couldn't load this record")).toBe(null);
  });

  it("reports the Supabase provider's zero-row error as not found", async () => {
    // `.single()` on no rows is PostgREST PGRST116, and supabase-provider.ts's
    // throwIfError copies `code` onto the Error it throws
    // (packages/core/src/provider/supabase-provider.ts).
    const pgrst116 = Object.assign(
      new Error(
        "JSON object requested, multiple (or no) rows returned"
      ),
      { code: "PGRST116" }
    );
    renderBound(
      <ResourceDetailPage resource="people" id="404">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(rejects(pgrst116))
    );

    expect(await screen.findByText("Not found")).toBeDefined();
    // The raw PostgREST string must not reach the page.
    expect(
      screen.queryByText(/JSON object requested/)
    ).toBe(null);
  });

  it("reports the switchboard provider's missing-row error as not found", async () => {
    // Verbatim from packages/data-switchboard/src/data-provider.ts.
    renderBound(
      <ResourceDetailPage resource="people" id="404">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(
        rejects(
          new Error('switchboard-data-provider: no "people" row with id "404".')
        )
      )
    );

    expect(await screen.findByText("Not found")).toBeDefined();
  });

  it("still treats a successful empty response as not found", async () => {
    // No Genesis provider does this, but the DataProvider contract permits it
    // and a custom adapter is free to.
    renderBound(
      <ResourceDetailPage resource="people" id="404">
        {() => <p>body</p>}
      </ResourceDetailPage>,
      stubProvider(resolves(null))
    );

    expect(await screen.findByText("Not found")).toBeDefined();
    expect(screen.queryByText("Couldn't load this record")).toBe(null);
  });

  it("fetches a zero id instead of calling an existing record missing", async () => {
    // `useOne` defaults to `enabled: !!id`, and `Identifier` is
    // `string | number`, so a numeric primary key of 0 would disable the
    // query and render "Not found" without ever asking the provider.
    const getOne = resolves({ id: 0, name: "Row zero" });
    renderBound(
      <ResourceDetailPage resource="people" id={0}>
        {(row) => <p>body for {String(row.name)}</p>}
      </ResourceDetailPage>,
      stubProvider(getOne)
    );

    expect(await screen.findByText("body for Row zero")).toBeDefined();
    expect(getOne).toHaveBeenCalledWith("people", { id: 0, select: undefined });
  });

  it("keeps two projections of the same record in separate cache entries", async () => {
    // Regression guard for the upstream `useOne` fix: its key used to be
    // [resource, "detail", id], so a second page asking for the same row with
    // a different `select` was served the first one's projection for the
    // whole staleTime window — silently missing the joined fields it asked
    // for. Both requests must reach the provider.
    const getOne = vi.fn(async (_r: string, p: { select?: string }) => ({
      data: { id: "1", name: p.select ? "joined" : "plain" },
    })) as unknown as GetOne;
    const provider = stubProvider(getOne);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const tree = (select?: string) => (
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <ResourceDetailPage resource="people" id="1" select={select}>
            {(row) => <p>projection: {String(row.name)}</p>}
          </ResourceDetailPage>
        </DataProviderRoot>
      </QueryClientProvider>
    );

    const first = render(tree());
    expect(await screen.findByText("projection: plain")).toBeDefined();
    first.unmount();

    render(tree("*, owner:profiles(name)"));
    expect(await screen.findByText("projection: joined")).toBeDefined();
    expect(getOne).toHaveBeenCalledTimes(2);
  });
});
