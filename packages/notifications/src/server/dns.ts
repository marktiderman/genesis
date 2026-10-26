/**
 * Is a sender domain the tenant's, and ready to send from? An ownership TXT
 * record holding the tenant's own token (so one tenant can't verify another's
 * domain), SPF on Resend's return-path host, DKIM at Resend's selector, and a
 * DMARC record, read through DNS over HTTPS so it runs anywhere `fetch` does.
 * The app's own shared sending domains (and anything under them) are never a
 * tenant's.
 */
import { timedFetch, type HttpDeps } from "./errors";

export interface DomainCheck {
  /** `_genesis-notifications.<domain>` holds `genesis-notifications-verify=<token>`. */
  ownership: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  /** The domain is (or is under) one of the app's own shared domains: never a tenant's. */
  reserved: boolean;
  /** Owned, all three records, and not reserved. */
  ok: boolean;
}

export interface DomainCheckOptions extends HttpDeps {
  /** The sender's `domain_token` (from `notification_senders`; made when the domain was set). */
  token: string;
  /** The app's shared sending domains (`email.domains`): a tenant may never verify one, or one under it. */
  reservedDomains: readonly string[];
  /** Default Cloudflare's JSON resolver. */
  resolver?: string;
  /** Resend's DKIM selector. Default `resend`. */
  dkimSelector?: string;
  /** Where the SPF record lives. Default `send.<domain>` (Resend's return path). */
  spfHost?: string;
  /** What the SPF record includes. Default `amazonses.com` (Resend's). */
  spfInclude?: string;
}

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The ownership record's host. */
export const SENDER_OWNERSHIP_HOST = "_genesis-notifications";

/**
 * The TXT record a tenant adds to prove `domain` is theirs: show it beside
 * Resend's SPF and DKIM records in your sender settings.
 *
 * @stability Beta
 */
export function senderOwnershipRecord(domain: string, token: string): { type: "TXT"; name: string; value: string } {
  return { type: "TXT", name: `${SENDER_OWNERSHIP_HOST}.${domain}`, value: `genesis-notifications-verify=${token}` };
}

/** Whether `domain` is one of `reserved`, or under one. */
export function isReservedDomain(domain: string, reserved: readonly (string | undefined | null)[]): boolean {
  const d = domain.toLowerCase().replace(/\.$/, "");
  return reserved.some((r) => {
    const x = r?.toLowerCase().replace(/\.$/, "");
    return !!x && (d === x || d.endsWith(`.${x}`));
  });
}

async function txt(options: DomainCheckOptions, name: string): Promise<string[]> {
  const url = new URL(options.resolver ?? "https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");
  const response = await timedFetch(options, url.toString(), { headers: { accept: "application/dns-json" } });
  if (!response.ok) return [];
  const json = (await response.json()) as { Answer?: { type?: number; data?: string }[] };
  return (json.Answer ?? [])
    .filter((a) => a.type === 16 && typeof a.data === "string")
    // A TXT answer comes quoted, maybe in several strings: "v=spf1 " "include:…"
    .map((a) => a.data!.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
}

/**
 * Checks ownership, SPF, DKIM and DMARC for `domain`. Record the result with
 * `genesis_notifications_set_sender_dns(tenant, domain, token, ok ? 'verified' : 'failed', result)`
 * with the same token, so a check made before the tenant changed its domain changes nothing.
 *
 * @stability Beta
 */
export async function checkSenderDomain(domain: string, options: DomainCheckOptions): Promise<DomainCheck> {
  if (!DOMAIN.test(domain)) throw new Error("checkSenderDomain: not a domain name");
  if (typeof options?.token !== "string" || !/^[0-9a-f]{32}$/.test(options.token)) throw new Error("checkSenderDomain: token is the sender's domain_token");
  if (!Array.isArray(options.reservedDomains) || options.reservedDomains.length === 0) {
    throw new Error("checkSenderDomain: reservedDomains (the app's shared sending domains) is required");
  }
  const reserved = isReservedDomain(domain, options.reservedDomains);
  if (reserved) return { ownership: false, spf: false, dkim: false, dmarc: false, reserved: true, ok: false };
  const include = options.spfInclude ?? "amazonses.com";
  const proof = senderOwnershipRecord(domain, options.token);
  const [owner, spf, dkim, dmarc] = await Promise.all([
    txt(options, proof.name),
    txt(options, options.spfHost ?? `send.${domain}`),
    txt(options, `${options.dkimSelector ?? "resend"}._domainkey.${domain}`),
    txt(options, `_dmarc.${domain}`),
  ]);
  const result = {
    ownership: owner.some((r) => r.trim() === proof.value),
    spf: spf.some((r) => /^v=spf1\b/i.test(r) && r.toLowerCase().includes(`include:${include}`)),
    dkim: dkim.some((r) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(r)),
    dmarc: dmarc.some((r) => /^v=DMARC1\b/i.test(r)),
    reserved: false,
  };
  return { ...result, ok: result.ownership && result.spf && result.dkim && result.dmarc };
}
