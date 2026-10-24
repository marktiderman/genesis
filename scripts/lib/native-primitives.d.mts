// Types for native-primitives.mjs, so TypeScript callers (genesis-cli's doctor)
// can import the shared list without allowJs.

/** React Native primitive -> the Genesis components that replace it. */
export declare const NATIVE_WRAPPED_PRIMITIVES: Readonly<Record<string, readonly string[]>>;

/** The wrapped primitives named in one import clause's `{ ... }` list (aliases resolved to the imported name). */
export declare function wrappedPrimitivesIn(namedImports: string): string[];
