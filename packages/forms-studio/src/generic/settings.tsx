import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@marktiderman/genesis-ui";

/**
 * One group of settings as a card: an icon, a title and a sentence, then its rows
 * (genesis-ui `SettingsRow` and `ToggleRow`: a label, a one-sentence description and the
 * control), divided by lines. On a phone a row whose control isn't a switch puts the
 * control under its label, so wide controls (a link, a list of people) still fit.
 */
export function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
  className,
}: {
  /** The jump link's target. */
  id?: string | undefined;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="settings-section"
      className={cn("scroll-mt-6 rounded-lg border border-border bg-card text-card-foreground", className)}
    >
      <header className="flex gap-3 border-b border-border px-5 py-4">
        {icon ? (
          <span className="mt-0.5 text-primary [&_svg]:size-5" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 id={headingId} className="font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      <div
        className={cn(
          "divide-y divide-border",
          // Rows: genesis-ui SettingsRow and ToggleRow, padded to the card.
          "[&>*]:px-5 [&>[data-slot=settings-row]]:py-3.5",
          "[&>[data-slot=settings-row]:not(:has([role=switch]))]:max-sm:flex-col",
          "[&>[data-slot=settings-row]:not(:has([role=switch]))]:max-sm:items-stretch",
          "[&>[data-slot=settings-row]>div:last-child]:max-sm:flex-wrap",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export interface SettingsPageSection {
  id: string;
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  /** The rows. Absent: a jump link only, to `#id` elsewhere on the page (or `onSelect`). */
  content?: ReactNode;
  /** For a link-only section whose target has no id: scroll to it yourself. */
  onSelect?: (() => void) | undefined;
}

/**
 * Every setting of one thing (a form, a course) on one page: jump links on the left ("On this page", the one in
 * view marked), the sections as cards on the right. On a phone the links sit above the
 * sections as a row that scrolls sideways.
 *
 * Not genesis-ui's `SettingsPage`: that one is a whole page with its own title, and plain
 * sections; these settings sit under the resource's header, as cards with icons.
 */
export function ResourceSettingsPage({
  sections,
  navLabel = "On this page",
  className,
}: {
  sections: readonly SettingsPageSection[];
  navLabel?: string | undefined;
  className?: string | undefined;
}) {
  const [active, setActive] = useState(sections[0]?.id);
  const ids = sections.map((s) => s.id).join(" ");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-slot="resource-settings-page"
      className={cn("grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8", className)}
    >
      <nav aria-label={navLabel} className="min-w-0 md:sticky md:top-4 md:self-start">
        <p className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">
          {navLabel}
        </p>
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "location" : undefined}
                onClick={(e) => {
                  setActive(s.id);
                  if (s.content === undefined && s.onSelect) {
                    e.preventDefault();
                    s.onSelect();
                  }
                }}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                  active === s.id && "bg-muted font-medium text-foreground",
                )}
              >
                {s.icon ? <span aria-hidden>{s.icon}</span> : null}
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        {sections
          .filter((s) => s.content !== undefined)
          .map((s) => (
            <SettingsSection key={s.id} id={s.id} icon={s.icon} title={s.title} description={s.description}>
              {s.content}
            </SettingsSection>
          ))}
      </div>
    </div>
  );
}
