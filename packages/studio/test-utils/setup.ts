// Vitest setup for @marktiderman/genesis-studio.
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

// The grid virtualizes its rows, so it renders only what fits the viewport it
// measures; give happy-dom (which does no layout) a viewport to lay out in.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 520 });
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1024 });
// @tanstack/virtual-core 3.19 measures the scroll element by its client box.
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 520 });
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1024 });
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ x: 0, y: 0, top: 0, left: 0, bottom: 520, right: 1024, width: 1024, height: 520, toJSON: () => ({}) }) as DOMRect;
