import * as React from "react";
import { cn } from "../../utils";
import { Split, type SplitBreakpoint } from "./split";

export interface DetailPageProps
  // `HTMLAttributes` already declares `title?: string` (the native tooltip
  // attribute). Omit it before redeclaring the page title as a ReactNode —
  // the same collision `Section` handles, for the same reason.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Page title. Rendered as the page's single `<h1>`. */
  title: React.ReactNode;
  /** Supporting line under the title — a status, an owner, a last-updated. */
  subtitle?: React.ReactNode;
  /** Slot above the title: a `Breadcrumb`, a back link, a `StatusBadge`. */
  breadcrumb?: React.ReactNode;
  /** Trailing controls for the whole record — Edit, Archive, a menu. */
  actions?: React.ReactNode;
  /**
   * Metadata column. Omit it and the content region takes the full width —
   * no empty track, no `Split`, no wrapper to reason about.
   */
  sidebar?: React.ReactNode;
  /**
   * Breakpoint at and above which the sidebar sits beside the content.
   * Below it the two stack, content first. Default `"lg"`.
   */
  sidebarAt?: SplitBreakpoint;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * DetailPage — one record's full view: a title row with actions, a primary
 * content region, and a metadata sidebar that drops below the content on
 * small screens.
 *
 * ```tsx
 * <DetailPage
 *   breadcrumb={<Breadcrumb>…</Breadcrumb>}
 *   title={person.name}
 *   subtitle={person.role}
 *   actions={<Button testID="edit">Edit</Button>}
 *   sidebar={
 *     <Stack gap="lg">
 *       <StatCard label="Sessions" value={12} />
 *       <SettingsRow label="Owner">{person.owner}</SettingsRow>
 *     </Stack>
 *   }
 * >
 *   <Section title="Timeline">{…}</Section>
 * </DetailPage>
 * ```
 *
 * `Split` is the backbone, at `ratio="2/3"` — content takes eight of twelve
 * tracks, metadata four. Reading order is content-then-metadata in the DOM,
 * which is also the order they stack in, so a phone shows the record before
 * its provenance rather than after it.
 *
 * This is a **layout**: it positions three regions and never asks what is in
 * them. Fetching the record is the caller's job — or
 * `ResourceDetailPage` from `@marktiderman/genesis-ui/data`, which is this
 * component with `useOne` wired to its title, content and sidebar.
 *
 * The header row is markup, not a component, and deliberately not
 * `PageHeader` — which now sits in this same folder, so composing it would
 * be legal. It was tried and measured, and it does not fit:
 *
 * 1. `PageHeader.title` and `.subtitle` are `string`. Every template's title
 *    would narrow from `ReactNode`, and a record heading is the one place a
 *    `StatusBadge` beside the name is routine.
 * 2. `@marktiderman/genesis-ui/detail-page`'s emitted closure goes from
 *    5.8 KB / 5 chunks to 34.4 KB / 14, and picks up a runtime dependency on
 *    `radix-ui` (Popover, Collapsible, Switch, and Select via `ViewSettings`)
 *    — for a header that renders a title, a line under it and a slot, and
 *    mounts none of that. Per-component subpaths exist so a consumer does
 *    not pay for what they did not import.
 * 3. `PageHeader` has no slot above the title, and hard-codes
 *    `data-testid="page-title"` on its `<h1>`.
 *
 * Not a reason, having checked it: RSC. `PageHeader` is `"use client"`, but
 * the emitted `detail-page.js` is NOT stamped with the directive when it
 * imports it — a server module importing a client module is the ordinary
 * boundary. What would make folding correct is upstream: widen `title` /
 * `subtitle` to `ReactNode`, and lift the list chrome out of `PageHeader`.
 *
 * Width is deliberately not an opinion here. `Container` already answers
 * "how wide is this page", so wrap rather than duplicate:
 * `<Container size="lg"><DetailPage … /></Container>`. Under `AppShell`,
 * whose `<main>` already pads, most pages want neither.
 *
 * @stability Beta
 */
export const DetailPage = React.forwardRef<HTMLDivElement, DetailPageProps>(
  (
    {
      className,
      title,
      subtitle,
      breadcrumb,
      actions,
      sidebar,
      sidebarAt = "lg",
      testID,
      children,
      ...props
    },
    ref
  ) => {
    const content = (
      <div data-slot="detail-page-content" className="min-w-0">
        {children}
      </div>
    );

    return (
      <div
        ref={ref}
        data-slot="detail-page"
        data-testid={testID}
        // gap-6 is the `xl` step of the shared spacing scale (24px), the same
        // rhythm `Section` uses between a page's top-level regions.
        className={cn("flex flex-col gap-6", className)}
        {...props}
      >
        <header
          data-slot="detail-page-header"
          className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb ? (
              <div data-slot="detail-page-breadcrumb">{breadcrumb}</div>
            ) : null}
            <h1
              data-slot="detail-page-title"
              className="truncate text-xl font-bold tracking-tight sm:text-2xl"
            >
              {title}
            </h1>
            {subtitle ? (
              <p
                data-slot="detail-page-subtitle"
                className="text-sm text-muted-foreground"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div
              data-slot="detail-page-actions"
              className="flex shrink-0 items-center gap-2"
            >
              {actions}
            </div>
          ) : null}
        </header>

        {sidebar ? (
          <Split
            at={sidebarAt}
            ratio="2/3"
            gap="xl"
            start={content}
            end={
              <aside data-slot="detail-page-sidebar" className="min-w-0">
                {sidebar}
              </aside>
            }
          />
        ) : (
          content
        )}
      </div>
    );
  }
);
DetailPage.displayName = "DetailPage";
