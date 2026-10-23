// A form page's status chip and its four child navigation items with their counts. Pure.
import type { FormDefinition } from "@marktiderman/genesis-forms";
import type { FormAvailability } from "./availability";
import type { ChipTone, NavItem } from "./generic/status";

/**
 * A form's status chip: "Live · version 3", "Draft", "Paused · version 3"… `availability`
 * is formAvailability's answer; `version` the live version, when there is one.
 */
export function formStatusChip(
  availability: FormAvailability,
  version?: number | null,
): { label: string; tone: ChipTone } {
  const v = version ? ` · version ${version}` : "";
  switch (availability) {
    case "live":
      return { label: `Live${v}`, tone: "success" };
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "paused":
      return { label: `Paused${v}`, tone: "warning" };
    case "scheduled":
      return { label: `Scheduled${v}`, tone: "info" };
    case "closed":
      return { label: `Closed${v}`, tone: "muted" };
    case "full":
      return { label: `Full${v}`, tone: "warning" };
    case "archived":
      return { label: "Archived", tone: "muted" };
  }
}

/** The form page's four places, in order. */
export type FormTab = "questions" | "logic" | "responses" | "settings";

/** One of a form page's child navigation items. */
export type FormNavItem = NavItem<FormTab>;

/** How many questions a definition asks, and how many rules plus endings it has. */
export function formCounts(definition: FormDefinition | null | undefined): {
  questions: number;
  logic: number;
} {
  if (!definition) return { questions: 0, logic: 0 };
  return {
    questions: definition.blocks.filter((b) => b.kind === "field").length,
    logic: (definition.logic?.length ?? 0) + (definition.endings?.length ?? 0),
  };
}

/**
 * The form page's child navigation items (Questions, Logic and endings, Responses,
 * Settings) with their counts as badges, for the app shell's sub-navigation
 * (`useAppShellSubNav(formNavItems(counts, { to }))`). A count left out (or null) shows
 * no badge. `to` gives each place's address; by default `?tab=<id>` on the current route,
 * and Questions (the default) with no search at all.
 */
export function formNavItems(
  counts: { questions?: number | null; logic?: number | null; responses?: number | null } = {},
  options: { to?: ((tab: FormTab) => string) | undefined } = {},
): FormNavItem[] {
  const to = options.to ?? ((tab: FormTab) => (tab === "questions" ? "?" : `?tab=${tab}`));
  const item = (id: FormTab, label: string, badge?: number | null): FormNavItem =>
    badge == null ? { id, to: to(id), label } : { id, to: to(id), label, badge };
  return [
    item("questions", "Questions", counts.questions),
    item("logic", "Logic and endings", counts.logic),
    item("responses", "Responses", counts.responses),
    item("settings", "Settings"),
  ];
}
