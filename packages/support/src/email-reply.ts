/**
 * Reply by email, the server half: a signed reply address per ticket and recipient, and what
 * someone wrote in their reply without what their mail app added.
 *
 * **The address.** The Reply-To of a support email names the ticket and the one person it went
 * to, signed, so answering the email answers the conversation and nothing is stored:
 *
 *   <token>@<reply domain>     token = version letter ‖ base32(ticket id ‖ login id ‖ MAC)
 *
 * The MAC is the first 7 bytes of HMAC-SHA256 over "ticket:recipient" with a key derived from a
 * server secret (`replyKey(SUPPORT_REPLY_SIGNING_SECRET)`), so nobody can make an address for a
 * ticket or a person they weren't sent. Lower-case base32 (mail systems lowercase addresses), 64
 * characters, the most a local part may have, so the domain is only for these replies. A later key
 * gets the next version letter.
 *
 * **The reply.** `stripReply` keeps what is above the quoted history ("On … wrote:", Outlook's
 * header block, ">" lines), the `REPLY_MARKER` line and the signature. Auto-replies are filtered
 * by genesis-notifications' inbound router (Auto-Submitted, Precedence) before this runs.
 *
 * Server only (node:crypto).
 *
 * @stability Beta
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const MAC_BYTES = 7;
/** The token format's version letter: which key signed it. */
export const REPLY_TOKEN_VERSION = "a";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who a reply address is for: a ticket, and the login the email went to. */
export interface ReplyClaims {
  ticketId: string;
  userId: string;
}

/** The signing key for reply addresses, derived from a server secret (SUPPORT_REPLY_SIGNING_SECRET): its own purpose, its own key. */
export function replyKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("genesis-support/reply-address/v1").digest();
}

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text: string): Buffer | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text.toLowerCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex");
const uuidOf = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const mac = (key: Buffer, c: ReplyClaims) =>
  createHmac("sha256", key).update(`${c.ticketId.toLowerCase()}:${c.userId.toLowerCase()}`).digest().subarray(0, MAC_BYTES);

/** The token for a ticket and a recipient: a version letter and 63 lower-case base32 characters. */
export function createReplyToken(key: Buffer, claims: ReplyClaims): string {
  if (!UUID.test(claims.ticketId) || !UUID.test(claims.userId)) throw new Error("A reply token names a ticket and a login by id");
  return REPLY_TOKEN_VERSION + base32(Buffer.concat([uuidBytes(claims.ticketId), uuidBytes(claims.userId), mac(key, claims)]));
}

/** The ticket and recipient a token names, when it is one this key signed (this version); else null. */
export function verifyReplyToken(key: Buffer, token: string): ReplyClaims | null {
  if (!/^[a-z2-7]{64}$/i.test(token) || token[0]!.toLowerCase() !== REPLY_TOKEN_VERSION) return null;
  const raw = unbase32(token.slice(1));
  // Exactly the bytes' own spelling: no second token for the same address through the unused bits.
  if (!raw || raw.length !== 32 + MAC_BYTES || base32(raw) !== token.slice(1).toLowerCase()) return null;
  const claims = { ticketId: uuidOf(raw.subarray(0, 16)), userId: uuidOf(raw.subarray(16, 32)) };
  const given = raw.subarray(32);
  const expected = mac(key, claims);
  return timingSafeEqual(given, expected) ? claims : null;
}

/** The reply address for a ticket and a recipient on the reply domain. */
export function replyAddress(key: Buffer, domain: string, claims: ReplyClaims): string {
  return `${createReplyToken(key, claims)}@${domain.toLowerCase()}`;
}

/** The claims of the first address on `domain` that is a reply address this key signed, else null. */
export function claimsFromAddresses(key: Buffer, domain: string, addresses: readonly string[]): ReplyClaims | null {
  const suffix = `@${domain.toLowerCase()}`;
  for (const address of addresses) {
    const a = address.trim().toLowerCase();
    if (!a.endsWith(suffix)) continue;
    const claims = verifyReplyToken(key, a.slice(0, -suffix.length));
    if (claims) return claims;
  }
  return null;
}

// What someone wrote ------------------------------------------------------------------------

/** Our marker, at the top of every support email that takes replies: anything from it down is quoted. */
export const REPLY_MARKER = "Reply above this line to answer";

/** Longest reply kept (the conversation's own limit). */
export const MAX_REPLY_CHARS = 10_000;

// A line that starts the quoted history: everything from it on is dropped.
const QUOTE_HEADERS: RegExp[] = [
  // Gmail and Apple Mail: "On Mon, 13 Nov 2026 at 10:02, Acme <…> wrote:" (joined if wrapped).
  /^\s*on\b.{0,300}\bwrote:\s*$/i,
  // Gmail in other languages often ends the same way ("Am … schrieb …:", "Le … a écrit :").
  /^\s*(am|le|el|il|op)\b.{0,300}(schrieb|a écrit|escribió|ha scritto|schreef).{0,40}:\s*$/i,
  // Outlook.
  /^\s*-{2,}\s*original message\s*-{2,}\s*$/i,
  /^\s*_{10,}\s*$/,
  // Our marker, however the mail app quoted it.
  new RegExp(`^[\\s>]*${REPLY_MARKER}`, "i"),
];

// Outlook's header block without a separator line: "From:" followed within a few lines by "Sent:"/"Date:".
const OUTLOOK_FROM = /^\s*\*?(from|von|de):\*?\s/i;
const OUTLOOK_NEXT = /^\s*\*?(sent|date|to|subject|gesendet|envoyé|enviado):\*?\s/i;

// Signatures: the standard delimiter, and the lines phones and apps add.
const SIGNATURES: RegExp[] = [
  /^-- ?$/,
  /^\s*sent from my (iphone|ipad|android|samsung|galaxy|pixel|mobile|phone|blackberry)\b.*$/i,
  /^\s*sent from (outlook|mail for windows|yahoo mail|proton mail|my mobile device)\b.*$/i,
  /^\s*get outlook for (ios|android)\s*$/i,
  /^\s*sent with proton mail\b.*$/i,
];

/** HTML to text, after Gmail's and Apple Mail's quote blocks are removed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<div[^>]*class="[^"]*gmail_quote[\s\S]*$/i, "")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/<div[^>]*id="(appendonsend|divRplyFwdMsg)"[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** The reply's own text: no quoted history, no marker, no signature; trimmed and capped. */
export function stripReply(text: string, html?: string | null): string {
  const source = text.trim() ? text : html ? htmlToText(html) : "";
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Gmail wraps a long attribution over two lines: "On … <x@y.test>" then "wrote:".
    const joined = i + 1 < lines.length ? `${line} ${lines[i + 1]!.trim()}` : line;
    if (QUOTE_HEADERS.some((r) => r.test(line)) || (/^\s*on\b/i.test(line) && QUOTE_HEADERS[0]!.test(joined))) {
      end = i;
      break;
    }
    if (OUTLOOK_FROM.test(line) && lines.slice(i + 1, i + 4).some((l) => OUTLOOK_NEXT.test(l))) {
      end = i;
      break;
    }
    if (SIGNATURES.some((r) => r.test(line))) {
      end = i;
      break;
    }
  }
  const kept = lines.slice(0, end);
  // Any ">" lines left at the end are quoted too (a mail app that quotes without an attribution).
  while (kept.length && (/^\s*>/.test(kept[kept.length - 1]!) || !kept[kept.length - 1]!.trim())) kept.pop();
  return kept
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}
