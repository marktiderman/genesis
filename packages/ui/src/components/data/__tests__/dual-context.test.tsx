/**
 * Dual-context regression guard (contribution C1).
 *
 * BUG: genesis-ui used to ship its own private copy of the data provider
 * context + resource hooks (packages/ui/src/provider/context.tsx and
 * packages/ui/src/hooks/use-resource*.ts). Each `createContext()` call
 * mints a DISTINCT context instance. The exported <GenesisProvider> comes
 * from @marktiderman/genesis-core, so it populated CORE's context — but the
 * exported data components (ResourceForm, RelationField, ResourcePage in
 * resource mode) read genesis-ui's LOCAL context, which nothing ever
 * populated. Result: `useDataProvider must be used inside <DataProviderRoot>
 * or <GenesisProvider>` was thrown even when the app WAS wrapped correctly.
 *
 * FIX: the data components now import useResource / useResourceForm /
 * useDataProvider from @marktiderman/genesis-core, the same module the
 * exported provider populates. This test renders those components under the
 * exported <GenesisProvider> and asserts they do NOT throw the dual-context
 * error — i.e. the component and the provider share ONE context instance.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { RelationField } from "../RelationField";
import { ResourceForm } from "../ResourceForm";
import { ResourcePage } from "../ResourcePage";
import type { ResourceFormFieldDef } from "../ResourceFormField";

describe("dual-context regression (C1): exported components share the provider context", () => {
  it("RelationField (useResource + useDataProvider) renders under exported GenesisProvider without throwing", () => {
    const field: ResourceFormFieldDef = {
      key: "authorId",
      type: "relation",
      relation: { resource: "authors", labelField: "name" },
    };

    expect(() =>
      render(
        <GenesisProvider mock={{ datasets: { authors: [] } }}>
          <RelationField field={field} value="" onChange={() => {}} />
        </GenesisProvider>,
      ),
    ).not.toThrow();

    // Proves the component actually mounted (the trigger rendered), so the
    // no-throw above reflects the hooks running, not a short-circuit.
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("ResourceForm (useResourceForm) renders under exported GenesisProvider without throwing", () => {
    const fields: ResourceFormFieldDef[] = [{ key: "title", type: "text" }];

    expect(() =>
      render(
        <GenesisProvider mock={{ datasets: { posts: [] } }}>
          <ResourceForm
            resource="posts"
            action="create"
            open={false}
            onOpenChange={() => {}}
            fields={fields}
          />
        </GenesisProvider>,
      ),
    ).not.toThrow();
  });

  it("ResourcePage (resource mode: useResource + useDataProvider) renders under exported GenesisProvider without throwing", () => {
    expect(() =>
      render(
        <GenesisProvider
          mock={{ datasets: { posts: [{ id: "1", title: "Hello" }] } }}
        >
          <ResourcePage resource="posts" title="Posts" columns={["title"]} />
        </GenesisProvider>,
      ),
    ).not.toThrow();

    // Proves the page actually mounted (its title heading rendered), so the
    // no-throw above reflects the hooks running, not a short-circuit.
    expect(screen.getByText("Posts")).toBeTruthy();
  });

  it("ResourcePage (resource mode) throws expected error when rendered WITHOUT GenesisProvider", () => {
    expect(() =>
      render(
        <ResourcePage resource="posts" title="Posts" columns={["title"]} />,
      ),
    ).toThrow(
      "useDataProvider must be used inside <DataProviderRoot> or <GenesisProvider>",
    );
  });

  it("RelationField throws expected error when rendered WITHOUT GenesisProvider", () => {
    const field: ResourceFormFieldDef = {
      key: "authorId",
      type: "relation",
      relation: { resource: "authors", labelField: "name" },
    };

    expect(() =>
      render(<RelationField field={field} value="" onChange={() => {}} />),
    ).toThrow(
      "useDataProvider must be used inside <DataProviderRoot> or <GenesisProvider>",
    );
  });

  it("ResourceForm throws expected error when rendered WITHOUT GenesisProvider", () => {
    const fields: ResourceFormFieldDef[] = [{ key: "title", type: "text" }];

    expect(() =>
      render(
        <ResourceForm
          resource="posts"
          action="create"
          open={false}
          onOpenChange={() => {}}
          fields={fields}
        />,
      ),
    ).toThrow(
      "useDataProvider must be used inside <DataProviderRoot> or <GenesisProvider>",
    );
  });
});
