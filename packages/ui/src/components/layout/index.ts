/**
 * Layouts — page structure.
 *
 * Admission test (docs/FRAMEWORK.md): "Does it position things without
 * knowing what they are?" Layouts may lean on primitives and patterns.
 * Domain vocabulary and data are banned.
 *
 * Two groups live here, and the distinction is worth keeping straight:
 *
 * - **Layout primitives** — `Stack`, `Grid`, `Split`, `Section`,
 *   `Container`. Unopinionated bones: children plus layout props, nothing
 *   else. Infinite reuse, zero lock-in (FRAMEWORK.md migration step 7).
 * - **Page templates** — `AppShell`, `PageHeader`. Page-shaped, still
 *   data-free. They shipped from `components/data/` because that is where
 *   the export subpath happened to be, not because either one binds to a
 *   resource — neither takes a `DataProvider` or knows what a resource
 *   is. `ResourcePage` is the counterexample that shows the line: it is
 *   page-shaped too, but it needs a data provider, so it stays in `data/`.
 */

// Page templates (structure, no data)
export { AppShell, type AppShellProps, type AppShellOptions, type NavItem } from "./AppShell";
export { PageHeader, type PageHeaderProps, type PageHeaderOptions } from "./PageHeader";
// FRAMEWORK.md migration step 8. Each takes its content as props/children and
// binds to nothing; the record-bound counterpart to `DetailPage` is
// `ResourceDetailPage`, which needs a `DataProvider` and therefore ships from
// `@marktiderman/genesis-ui/data`.
export { DetailPage, type DetailPageProps } from "./detail-page";
export { FormPage, type FormPageProps } from "./form-page";
export { DashboardPage, type DashboardPageProps } from "./dashboard-page";
export {
  SettingsPage,
  type SettingsPageProps,
  type SettingsPageSection,
} from "./settings-page";

// Layout primitives (unopinionated bones)
export { Stack, stackVariants, type StackProps } from "./stack";
export { Grid, gridVariants, type GridProps } from "./grid";
export {
  Split,
  splitVariants,
  type SplitProps,
  type SplitBreakpoint,
  type SplitRatio,
} from "./split";
export { Section, sectionHeadingVariants, type SectionProps } from "./section";
export { Container, containerVariants, type ContainerProps } from "./container";
export { GAP_CLASSES, spaceScale, type SpaceToken } from "./spacing";
