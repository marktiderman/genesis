/**
 * The workbench's registry: every screen that shows a Genesis native feature, by section. A
 * package with a native surface adds its screens here (a file in `screens/`, one line below), and
 * `covers` names the exports each screen shows, so `check:workbench-coverage` can tell which
 * exported native components and layouts still have no screen.
 *
 * Each screen has a Maestro flow in `.maestro/workbench/<id>.yaml` that proves it on a device
 * (`pnpm workbench:prove`); the screen's testIDs are `workbench-<id>-…`.
 */
import type { ComponentType } from "react";
import { headerDrilldown, headerLarge } from "./screens/header";
import { placeExit } from "./screens/place-exit";
import { rowActionsItems, rowActionsList } from "./screens/row-actions";
import { tabBarHidden } from "./screens/tab-bar";

export type WorkbenchSection = "Standards" | "Components" | "Layouts";

export interface WorkbenchScreen {
  /** URL-safe, unique: the route is `/workbench/<id>`. */
  id: string;
  title: string;
  /** One sentence: what to look at, and what it should do. */
  summary: string;
  section: WorkbenchSection;
  /** The Genesis package the screen exercises. */
  package: string;
  /** The exports it shows (`NativeSwipeRow`, `ScreenContainer`…): the coverage check reads these. */
  covers: readonly string[];
  /** The screen. It sets its own header (ScreenContainer `header`). */
  screen: ComponentType;
}

export const workbenchScreens: readonly WorkbenchScreen[] = [rowActionsList, rowActionsItems, headerLarge, headerDrilldown, tabBarHidden, placeExit];

export const WORKBENCH_SECTIONS: readonly WorkbenchSection[] = ["Standards", "Components", "Layouts"];

export function workbenchScreen(id: string): WorkbenchScreen | undefined {
  return workbenchScreens.find((s) => s.id === id);
}
