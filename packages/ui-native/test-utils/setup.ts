// Vitest setup. Cleans up @testing-library/react state between tests.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
