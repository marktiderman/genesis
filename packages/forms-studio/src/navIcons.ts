import { GitBranch, Inbox, ListChecks, Settings } from "lucide-react";
import type { FormTab } from "./status";

/** The form page's four places' icons, for `formNavItems(path, counts, FORM_NAV_ICONS)`. */
export const FORM_NAV_ICONS = {
  questions: ListChecks,
  logic: GitBranch,
  responses: Inbox,
  settings: Settings,
} satisfies Record<FormTab, unknown>;
