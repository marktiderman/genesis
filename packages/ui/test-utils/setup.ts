// Vitest setup for @marktiderman/genesis-ui.
//
// Cleans up @testing-library/react between tests and polyfills the two
// browser APIs Radix primitives touch but happy-dom does not fully
// implement (ResizeObserver). matchMedia is provided by happy-dom.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
