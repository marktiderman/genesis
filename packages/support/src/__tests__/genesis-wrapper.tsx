// The providers the web screens' lists need: genesis-ui's ResourceView reads through
// GenesisProvider's data provider, though these lists draw the support client's own rows.
import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import { GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";

export function genesisWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const provider = {
    getList: vi.fn(async () => ({ data: [], total: 0 })),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

/** A `wrapper` for render: one cache and provider for the life of the rendered screen. */
export function GenesisTestProviders({ children }: { children: ReactNode }) {
  const [Wrapper] = useState(() => genesisWrapper());
  return <Wrapper>{children}</Wrapper>;
}
