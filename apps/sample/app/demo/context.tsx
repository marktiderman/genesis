import { createContext, useContext } from "react";
import type { DataProvider } from "@marktiderman/genesis-core/provider";
import type { DemoRole, Org } from "./tenants";

export interface DemoState {
  /** The current organization, or undefined in the roll-up. */
  org: Org | undefined;
  /** The workspace id in the URL: an organization's id, or "all". */
  ws: string;
  role: DemoRole;
  /** The signed-in client's id, when the role is "client". */
  self: string | undefined;
  provider: DataProvider;
  /** Features the visitor switched off, and flag values, per organization. */
  overrides: { off: string[]; flags: Record<string, boolean> };
  setOverrides: (next: { off: string[]; flags: Record<string, boolean> }) => void;
  /** A path inside the current workspace: `href("clients")` → `/demo/harbor/clients`. */
  href: (path?: string) => string;
}

export const DemoContext = createContext<DemoState | null>(null);

export function useDemo(): DemoState {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo outside the demo shell.");
  return value;
}
