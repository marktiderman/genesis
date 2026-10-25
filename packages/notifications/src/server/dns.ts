/**
 * Is a sender domain ready to send from? SPF on Resend's return-path host,
 * DKIM at Resend's selector, and a DMARC record, read through DNS over HTTPS
 * so it runs anywhere `fetch` does.
 */
import { timedFetch, type HttpDeps } from "./errors";

export interface DomainCheck {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  /** All three. */
  ok: boolean;
}

export interface DomainCheckOptions extends HttpDeps {
  /** Default Cloudflare's JSON resolver. */
  resolver?: string;
  /** Resend's DKIM selector. Default `resend`. */
  dkimSelector?: string;
  /** Where the SPF record lives. Default `send.<domain>` (Resend's return path). */
  spfHost?: string;
  /** What the SPF record includes. Default `amazonses.com` (Resend's). */
  spfInclude?: string;
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
 * Checks SPF, DKIM and DMARC for `domain`.
 *
 * @stability Beta
 */
export async function checkSenderDomain(domain: string, options: DomainCheckOptions = {}): Promise<DomainCheck> {
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("checkSenderDomain: not a domain name");
  const include = options.spfInclude ?? "amazonses.com";
  const [spf, dkim, dmarc] = await Promise.all([
    txt(options, options.spfHost ?? `send.${domain}`),
    txt(options, `${options.dkimSelector ?? "resend"}._domainkey.${domain}`),
    txt(options, `_dmarc.${domain}`),
  ]);
  const result = {
    spf: spf.some((r) => /^v=spf1\b/i.test(r) && r.toLowerCase().includes(`include:${include}`)),
    dkim: dkim.some((r) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(r)),
    dmarc: dmarc.some((r) => /^v=DMARC1\b/i.test(r)),
  };
  return { ...result, ok: result.spf && result.dkim && result.dmarc };
}
