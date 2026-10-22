/** ResourcePage shows a provider's DataReadError sentence, never raw store text. */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { DataReadError } from "@marktiderman/genesis-core/provider";
import { ResourcePage } from "../ResourcePage";

describe("ResourcePage read errors", () => {
  it("shows the read error's plain message", async () => {
    const base = createMockProvider({ tasks: [] });
    const provider = {
      ...base,
      getList: () =>
        Promise.reject(
          new DataReadError("forbidden", "You don't have access to these tasks.", {
            cause: { message: "permission denied for table tasks" },
          }),
        ),
    };
    render(
      <GenesisProvider provider={provider} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ResourcePage resource="tasks" title="Tasks" columns={["title"]} />
      </GenesisProvider>,
    );
    await waitFor(() => expect(screen.getByText("You don't have access to these tasks.")).toBeTruthy());
    expect(screen.queryByText(/permission denied/)).toBeNull();
  });
});
