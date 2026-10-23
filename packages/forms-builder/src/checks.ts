import { createContext, useContext } from "react";
import type { Finding } from "./analyze";

/**
 * Which checks the author sees yet. A question added in this session starts
 * without a title, so its "needs a title" error waits until the author has
 * left the title field once, or until someone tries to publish
 * (`FormBuilderHandle.revealChecks()`). Questions loaded with the form are
 * checked at once.
 */
export interface ChecksState {
  /** Questions added in this session whose title field has not been left yet. */
  fresh: ReadonlySet<string>;
  /** True once every check is shown (after a publish attempt). */
  revealed: boolean;
  /** A question was just added: hold back its title check. */
  markFresh(id: string): void;
  /** The author left this question's title field: show its title check from now on. */
  touch(id: string): void;
}

export const ChecksContext = createContext<ChecksState | null>(null);

/** The checks state of the builder around a panel; null when a panel is used on its own (every check shows). */
export function useChecks(): ChecksState | null {
  return useContext(ChecksContext);
}

/**
 * The findings to show the author: a fresh question's missing title is held
 * back, and the empty form's "Add at least one question" reads as a hint
 * (`info`), not an error. `Analysis.canPublish` still counts every error.
 */
export function visibleFindings(findings: readonly Finding[], checks: Pick<ChecksState, "fresh" | "revealed"> | null): Finding[] {
  return findings.flatMap((f): Finding[] => {
    if (f.code === "no-questions") return [{ ...f, level: "info" }];
    if (f.code === "untitled-question" && checks && !checks.revealed && f.ref && checks.fresh.has(f.ref.id)) return [];
    return [f];
  });
}
