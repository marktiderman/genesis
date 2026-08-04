import * as React from "react";
import { cn } from "../../utils";
import { Section } from "./section";
import { Split, type SplitBreakpoint } from "./split";

/**
 * One region of a settings surface: a nav-rail entry and the panel it jumps
 * to, declared together so the two can't drift apart.
 *
 * `@marktiderman/genesis-ui-native` exports a type of the same name whose
 * shape differs — it carries `rows: SettingsPageRow[]` and a `footnote`,
 * because a native settings screen is a sectioned list of drill-in rows
 * rather than a scrollable surface with a jump rail (a rail has nowhere to
 * live on a phone). The shared field names mean the same thing on both:
 * `id` keys the section, `title` names it. That parity is deliberate, and
 * it is the same accommodation `Stack` documents for its own two-surface
 * shape difference.
 */
export interface SettingsPageSection {
  /**
   * Fragment id. The rail links to `#${id}` and the `<section>` carries it,
   * so the jump works with no JavaScript and survives a deep link.
   */
  id: string;
  /**
   * Rail entry and section heading — one string, so they always match.
   *
   * Named `title` rather than `label` to match the native surface's word for
   * the same thing. Required here where native's is optional: a rail entry
   * with no name is a link to nowhere, whereas an unlabeled native section
   * is a normal grouping.
   */
  title: string;
  /** Supporting copy under the section heading. */
  description?: React.ReactNode;
  /** The rows themselves — `SettingsRow` / `ToggleRow` are the natural ones. */
  content: React.ReactNode;
}

export interface SettingsPageProps
  // `HTMLAttributes` already declares `title?: string` (the native tooltip
  // attribute); omit it before redeclaring the page title as a ReactNode.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Page title. Rendered as the page's single `<h1>`. */
  title: React.ReactNode;
  /** Supporting copy under the title. */
  description?: React.ReactNode;
  /** Page-level trailing controls — "Save all", a workspace switcher. */
  actions?: React.ReactNode;
  /** The settings regions, in the order they appear in the rail. */
  sections: SettingsPageSection[];
  /**
   * Breakpoint at and above which the rail sits beside the sections. Below
   * it the rail stacks above them, where it reads as jump links. Default
   * `"md"`.
   */
  navAt?: SplitBreakpoint;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * SettingsPage — a sectioned settings surface with a nav rail for jumping
 * between sections.
 *
 * ```tsx
 * <SettingsPage
 *   title="Workspace settings"
 *   sections={[
 *     {
 *       id: "profile",
 *       title: "Profile",
 *       content: <SettingsRow label="Display name" htmlFor="name"><Input id="name" /></SettingsRow>,
 *     },
 *     {
 *       id: "notifications",
 *       title: "Notifications",
 *       description: "How and when we contact you.",
 *       content: <ToggleRow label="Weekly digest" checked={digest} onCheckedChange={setDigest} />,
 *     },
 *   ]}
 * />
 * ```
 *
 * Sections are a prop, not children, because the rail has to know their
 * titles and ids. Declaring each once is what makes "the rail says
 * Notifications and the heading says Alerts" unrepresentable.
 *
 * **The rail appears only when there is more than one section** — a rail
 * with a single entry is a link to where you already are. That is an
 * automatic consequence of the content rather than a prop, so nobody has to
 * remember to turn it off.
 *
 * The rail is `sticky top-6` with no breakpoint prefix, and that is correct
 * in both modes rather than an oversight: side by side it is a stretched
 * grid item, so it sticks for the length of the sections; stacked, its pane
 * is exactly its own height, so sticky positioning has nothing to travel
 * and it simply scrolls away. One class, right twice.
 *
 * Each section renders through `Section`, so it is a real `<section>` named
 * by its own heading via `aria-labelledby` — the thing that makes it a
 * landmark a screen-reader user can jump to, which is the whole promise the
 * visual rail is making.
 *
 * The header row is markup, not a component, and deliberately not
 * `PageHeader` — see `./detail-page` for the measured reasons composing it
 * was rejected across all four templates. Width is left to `Container` —
 * wrap, don't duplicate.
 *
 * This is a **layout**: it positions rows, it does not persist them. Where a
 * setting is stored, and when, is the app's. Genesis's answer for the
 * storing half is `useStorage` from `@marktiderman/genesis-core`, which a
 * caller wires up outside this component.
 *
 * @stability Beta
 */
export const SettingsPage = React.forwardRef<HTMLDivElement, SettingsPageProps>(
  (
    {
      className,
      title,
      description,
      actions,
      sections,
      navAt = "md",
      testID,
      ...props
    },
    ref
  ) => {
    const panels = (
      <div data-slot="settings-page-sections" className="flex min-w-0 flex-col gap-10">
        {sections.map((section) => (
          <Section
            key={section.id}
            id={section.id}
            title={section.title}
            description={section.description}
            // Leaves room above the heading when the rail jumps to it, so
            // the anchor doesn't land with the title flush against the
            // viewport edge.
            className="scroll-mt-6"
          >
            {section.content}
          </Section>
        ))}
      </div>
    );

    return (
      <div
        ref={ref}
        data-slot="settings-page"
        data-testid={testID}
        className={cn("flex flex-col gap-6", className)}
        {...props}
      >
        <header
          data-slot="settings-page-header"
          className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <h1
              data-slot="settings-page-title"
              className="truncate text-xl font-bold tracking-tight sm:text-2xl"
            >
              {title}
            </h1>
            {description ? (
              <p
                data-slot="settings-page-description"
                className="text-sm text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div
              data-slot="settings-page-actions"
              className="flex shrink-0 items-center gap-2"
            >
              {actions}
            </div>
          ) : null}
        </header>

        {sections.length > 1 ? (
          <Split
            at={navAt}
            ratio="1/3"
            gap="xl"
            start={
              <nav
                data-slot="settings-page-nav"
                aria-label="Settings sections"
                className="sticky top-6"
              >
                <ul className="flex flex-col gap-1">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block truncate rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            }
            end={panels}
          />
        ) : (
          panels
        )}
      </div>
    );
  }
);
SettingsPage.displayName = "SettingsPage";
