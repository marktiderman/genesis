/**
 * Context-identity guard (contribution C1).
 *
 * The dual-context regression suite proves the exported data components do
 * not THROW under the exported <GenesisProvider>. This test locks the
 * stronger invariant the C1 fix restores: genesis-ui and genesis-core share
 * exactly ONE DataProviderContext instance. A DataProvider handed to the
 * exported <GenesisProvider> must come back Object-identical from the
 * useDataProvider hook re-exported through genesis-ui's public provider
 * barrel. If genesis-ui ever grows its own `createContext()` copy again,
 * useDataProvider would read a different (never-populated) context and this
 * assertion fails.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createMockProvider,
  GenesisProvider,
  useDataProvider,
  type DataProvider,
} from "../index";

describe("context identity (C1): ui and core share ONE DataProviderContext", () => {
  it("useDataProvider returns the exact provider instance given to GenesisProvider", () => {
    const instance = createMockProvider({});
    let captured: DataProvider | null = null;

    function Probe() {
      captured = useDataProvider();
      return null;
    }

    render(
      <GenesisProvider provider={instance}>
        <Probe />
      </GenesisProvider>,
    );

    expect(captured).toBe(instance);
  });
});
