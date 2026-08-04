/**
 * useGenesisExtension — read a brand-package `extensions[<key>]` token scale.
 *
 * Brand packages declare domain-specific token categories under the
 * `extensions` slot of the canonical schema (PRD-07 D8 design decision).
 * Genesis primitives don't read these — only consumer composites do — so
 * this hook is the canonical accessor.
 *
 * Resolution order:
 *   1. `BrandExtensionsContext` value (set via <BrandExtensionsProvider>)
 *   2. `undefined` — the extension key isn't declared
 *
 * Consumers wire the provider once at app root; calls anywhere downstream
 * read by key.
 *
 *   <BrandExtensionsProvider value={brand.extensions}>
 *     <App />
 *   </BrandExtensionsProvider>
 *
 *   const moodTokens = useGenesisExtension("mood");
 *   // moodTokens?.[500] etc. — shape is consumer-defined
 *
 * Type contract: the canonical `BrandExtensions` interface lives in
 * `@marktiderman/genesis-design-system` (declaration-merging surface). At
 * runtime, consumers may pass a partially-populated object whose keys
 * match their own augmented `BrandExtensions`. We intentionally accept
 * `Partial<BrandExtensions>` here so the provider works with brand
 * packages that haven't declared extensions yet (a common case in newly
 * scaffolded apps).
 *
 * @stability Beta
 */
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import type { BrandExtensions } from "@marktiderman/genesis-design-system";

/**
 * Runtime shape passed to `<BrandExtensionsProvider>`. Consumers augment
 * the canonical `BrandExtensions` interface (in design-system) via TS
 * declaration merging; the provider accepts the resulting record.
 *
 * `Partial<>` so brand packages that have no extensions can still wrap
 * their app in the provider without TS errors.
 */
export type BrandExtensionsValue = Partial<BrandExtensions>;

const BrandExtensionsContext = createContext<BrandExtensionsValue | undefined>(
  undefined,
);

export interface BrandExtensionsProviderProps {
  value?: BrandExtensionsValue;
  children: ReactNode;
}

export function BrandExtensionsProvider({
  value,
  children,
}: BrandExtensionsProviderProps) {
  return createElement(
    BrandExtensionsContext.Provider,
    { value },
    children,
  );
}

/**
 * Read an extension scale by key. Returns `undefined` when the provider
 * isn't mounted OR when the key isn't declared on the brand. The return
 * type follows the consumer's augmented `BrandExtensions[K]`.
 */
export function useGenesisExtension<K extends keyof BrandExtensions>(
  key: K,
): BrandExtensions[K] | undefined {
  const ctx = useContext(BrandExtensionsContext);
  return ctx?.[key];
}
