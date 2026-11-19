/**
 * The contact fallback on the web: where people can write when the app can't help (the
 * `support.contactEmail` and `support.contactUrl` settings), in the messenger's Help and on its
 * error screens. Renders nothing without either.
 *
 * @stability Beta
 */
import { fill, resolveSupportCopy, type SupportCopyOverrides } from "../copy";
import type { SupportContactInfo } from "../settings";

export interface SupportContactProps {
  contact: SupportContactInfo | null | undefined;
  /** Leave the "Still need help?" heading out (inside an error state). */
  bare?: boolean;
  copy?: SupportCopyOverrides;
  className?: string;
}

/** Email and support-page links, or nothing. */
export function SupportContact({ contact, bare = false, copy: overrides, className }: SupportContactProps) {
  if (!contact || (!contact.email && !contact.url)) return null;
  const copy = resolveSupportCopy(overrides).contact;
  return (
    <div data-testid="genesis-support-contact" className={className ?? "flex flex-col gap-1 p-3 text-sm"}>
      {bare ? null : <p className="text-muted-foreground">{copy.title}</p>}
      {contact.email ? (
        <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${contact.email}`} data-testid="genesis-support-contact-email">
          {fill(copy.email, { email: contact.email })}
        </a>
      ) : null}
      {contact.url ? (
        <a className="text-primary underline-offset-4 hover:underline" href={contact.url} target="_blank" rel="noreferrer noopener" data-testid="genesis-support-contact-url">
          {copy.page}
        </a>
      ) : null}
    </div>
  );
}
