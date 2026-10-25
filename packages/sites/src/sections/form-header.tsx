/**
 * The embedded form's header. forms-web's own header opens with an `h1`
 * (right for a form that is the whole page); on a site page the section's
 * title is the heading, so the form's title is an `h3` under it. The server
 * render and the form island both use this, so the island hydrates the same
 * markup.
 */
import type { HeaderSlotProps } from "@marktiderman/genesis-forms-web";

export function SiteFormHeader({ title, description, requiredNote }: HeaderSlotProps) {
  return (
    <header className="flex flex-col gap-1">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
      {requiredNote ? (
        <p className="text-sm text-muted-foreground">
          <span aria-hidden="true">* </span>
          {requiredNote}
        </p>
      ) : null}
    </header>
  );
}

export const siteFormSlots = { header: SiteFormHeader };
