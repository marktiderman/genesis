/**
 * Reply by email, the server half: a signed reply address per ticket and recipient, and what
 * someone wrote in their reply without what their mail app added.
 *
 * **The address.** The Reply-To of a support email names the ticket, the one person it went to and
 * the week it was made, signed, so answering the email answers the conversation and nothing is
 * stored:
 *
 *   <token>@<reply domain>
 *   token = key letter ‖ base32(ticket id 16 ‖ login id 16 ‖ issued week 1 ‖ MAC 6)   (64 characters)
 *
 * - The MAC is the first 6 bytes of HMAC-SHA256 over the ids and the week, with a key derived from
 *   a server secret (`replyKey(SUPPORT_REPLY_SIGNING_SECRET)`): nobody can make an address for a
 *   ticket or a person they weren't sent, short of guessing 2^48 of them, each an email.
 * - **Rotation:** a `ReplyKeyring` holds keys by letter. New addresses use `current`; any letter
 *   still in the ring verifies, so old emails keep working until their key is removed (revoking
 *   every address it made).
 * - **Expiry:** the issued week (mod 256) lets old addresses lapse: `maxAgeWeeks`, default 26, at
 *   most 200.
 * - Lower-case base32 because mail systems lowercase addresses; 64 characters is the most a local
 *   part may have, so the reply domain is only for these replies.
 *
 * **A valid token is not enough.** It says who the email went to, not who answered. The inbound
 * route must still check, when the reply arrives, that `userId` is still the ticket's requester or
 * one of its handlers, and that the sender's address is that login's email with SPF and DKIM passing
 * (genesis-notifications' inbound router gives the results). Anything else is dropped.
 *
 * **The reply.** `stripReply` keeps what is above the quoted history ("On … wrote:", Outlook's
 * header block, ">" lines), the `REPLY_MARKER` line and the signature. Bodies are cut to
 * `MAX_EMAIL_CHARS` before anything else, and no pattern backtracks, so a hostile email can't stall
 * the server. Attributions are recognised in English and a few other languages (German, French,
 * Spanish, Italian, Dutch); others fall back to the ">" lines and the marker. Auto-replies are
 * filtered by genesis-notifications' inbound router before this runs.
 *
 * Server only (node:crypto).
 *
 * @stability Beta
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const MAC_BYTES = 6;
const TOKEN_BYTES = 32 + 1 + MAC_BYTES;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK_MS = 7 * 24 * 3600 * 1000;
/** The longest secret-derived key input refused: a secret shorter than this is no secret. */
const MIN_SECRET_LENGTH = 16;

/** Who a reply address is for: a ticket, and the login the email went to. @stability Beta */
export interface ReplyClaims {
  ticketId: string;
  userId: string;
}

/**
 * Keys by their letter (a–z), and the letter new addresses use. `legacy` holds keys, by their own
 * letters, for addresses an app made before adopting this module in the earlier format (ticket,
 * login and a 7-byte MAC over "ticket:login", no week): they still verify, never expire, and are
 * never made. A letter is in `keys` or `legacy`, not both.
 *
 * @stability Beta
 */
export interface ReplyKeyring {
  current: string;
  keys: Readonly<Record<string, Buffer>>;
  legacy?: Readonly<Record<string, Buffer>>;
}

/** @stability Beta */
export interface ReplyTokenOptions {
  /** Default `Date.now()`. */
  now?: number;
  /** Weeks an address keeps working. Default 26, at most 200. */
  maxAgeWeeks?: number;
}

/** The label Genesis derives reply keys under. @stability Beta */
export const REPLY_KEY_LABEL = "genesis-support/reply-address/v1";

/**
 * The signing key for reply addresses, derived from a server secret (SUPPORT_REPLY_SIGNING_SECRET)
 * under `label` (default `REPLY_KEY_LABEL`). An app that made reply addresses before passes its own
 * old label for the `legacy` key, so its addresses keep verifying. Throws on a missing or short secret.
 *
 * @stability Beta
 */
export function replyKey(secret: string, options: { label?: string } = {}): Buffer {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`replyKey: the secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const label = options.label ?? REPLY_KEY_LABEL;
  if (!label) throw new Error("replyKey: the label can't be empty");
  return createHmac("sha256", secret).update(label).digest();
}

/** A keyring with one key, letter `a`. @stability Beta */
export function replyKeyring(key: Buffer, letter = "a"): ReplyKeyring {
  return { current: letter, keys: { [letter]: key } };
}

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
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
const weekOf = (ms: number) => Math.floor(ms / WEEK_MS) & 255;
const mac = (key: Buffer, c: ReplyClaims, week: number) =>
  createHmac("sha256", key).update(`${c.ticketId.toLowerCase()}:${c.userId.toLowerCase()}:${week}`).digest().subarray(0, MAC_BYTES);

function keyOf(ring: ReplyKeyring, letter: string): Buffer | null {
  if (!/^[a-z]$/.test(letter) || !Object.prototype.hasOwnProperty.call(ring.keys, letter)) return null;
  return ring.keys[letter] ?? null;
}

/** The token for a ticket and a recipient, signed with the ring's current key. @stability Beta */
export function createReplyToken(ring: ReplyKeyring, claims: ReplyClaims, options: Pick<ReplyTokenOptions, "now"> = {}): string {
  if (!UUID.test(claims.ticketId) || !UUID.test(claims.userId)) throw new Error("A reply token names a ticket and a login by id");
  const key = keyOf(ring, ring.current);
  if (!key) throw new Error(`createReplyToken: the keyring has no key "${ring.current}"`);
  const week = weekOf(options.now ?? Date.now());
  return ring.current + base32(Buffer.concat([uuidBytes(claims.ticketId), uuidBytes(claims.userId), Buffer.from([week]), mac(key, claims, week)]));
}

const LEGACY_MAC_BYTES = 7;

/** An address in the earlier format: ticket ‖ login ‖ 7-byte MAC over "ticket:login". */
function verifyLegacy(key: Buffer, body: string): ReplyClaims | null {
  const raw = unbase32(body);
  if (!raw || raw.length !== 32 + LEGACY_MAC_BYTES || base32(raw) !== body.toLowerCase()) return null;
  const claims = { ticketId: uuidOf(raw.subarray(0, 16)), userId: uuidOf(raw.subarray(16, 32)) };
  const expected = createHmac("sha256", key).update(`${claims.ticketId}:${claims.userId}`).digest().subarray(0, LEGACY_MAC_BYTES);
  return timingSafeEqual(raw.subarray(32), expected) ? claims : null;
}

/** The ticket and recipient a token names, when a key in the ring signed it and it hasn't expired; else null. @stability Beta */
export function verifyReplyToken(ring: ReplyKeyring, token: string, options: ReplyTokenOptions = {}): ReplyClaims | null {
  if (typeof token !== "string" || !/^[a-z][a-z2-7]{63}$/i.test(token)) return null;
  const letter = token[0]!.toLowerCase();
  const legacy = ring.legacy && Object.prototype.hasOwnProperty.call(ring.legacy, letter) ? ring.legacy[letter] : undefined;
  if (legacy && !keyOf(ring, letter)) return verifyLegacy(legacy, token.slice(1));
  const key = keyOf(ring, letter);
  if (!key) return null;
  const raw = unbase32(token.slice(1));
  // Exactly the bytes' own spelling: no second token for the same address through the unused bits.
  if (!raw || raw.length !== TOKEN_BYTES || base32(raw) !== token.slice(1).toLowerCase()) return null;
  const claims = { ticketId: uuidOf(raw.subarray(0, 16)), userId: uuidOf(raw.subarray(16, 32)) };
  const week = raw[32]!;
  if (!timingSafeEqual(raw.subarray(33), mac(key, claims, week))) return null;
  const maxAge = Math.min(Math.max(Math.floor(options.maxAgeWeeks ?? 26), 0), 200);
  const age = (weekOf(options.now ?? Date.now()) - week + 256) & 255;
  return age <= maxAge ? claims : null;
}

/** The reply address for a ticket and a recipient on the reply domain. @stability Beta */
export function replyAddress(ring: ReplyKeyring, domain: string, claims: ReplyClaims, options: Pick<ReplyTokenOptions, "now"> = {}): string {
  return `${createReplyToken(ring, claims, options)}@${domain.toLowerCase()}`;
}

/** The bare address in `Name <a@b>` (or the text itself). */
function bareAddress(address: string): string {
  const open = address.lastIndexOf("<");
  const close = address.lastIndexOf(">");
  return (open >= 0 && close > open ? address.slice(open + 1, close) : address).trim().toLowerCase();
}

/**
 * The claims of the first address on `domain` that is a reply address the ring signed and that
 * hasn't expired, else null. Takes bare addresses or `Name <address>`. Check the claims again at use
 * (see the module's notes): a token says who the email went to, not who answered.
 *
 * @stability Beta
 */
export function claimsFromAddresses(ring: ReplyKeyring, domain: string, addresses: readonly string[], options: ReplyTokenOptions = {}): ReplyClaims | null {
  const suffix = `@${domain.toLowerCase()}`;
  for (const address of addresses) {
    const a = bareAddress(address);
    if (!a.endsWith(suffix)) continue;
    const claims = verifyReplyToken(ring, a.slice(0, -suffix.length), options);
    if (claims) return claims;
  }
  return null;
}

// What someone wrote ------------------------------------------------------------------------

/** Our marker, at the top of every support email that takes replies: anything from it down is quoted. @stability Beta */
export const REPLY_MARKER = "Reply above this line to answer";

/** Longest reply kept (the conversation's own limit). @stability Beta */
export const MAX_REPLY_CHARS = 10_000;

/** An email body (text or HTML) is cut to this before it is read. @stability Beta */
export const MAX_EMAIL_CHARS = 100_000;

// A line that starts the quoted history: everything from it on is dropped. Each is anchored and
// bounded, and runs on one line (or three joined), so none can backtrack over a whole body.
const QUOTE_HEADERS: RegExp[] = [
  // Gmail and Apple Mail: "On Mon, 13 Nov 2026 at 10:02, Acme <…> wrote:" (joined if wrapped).
  /^\s{0,20}on\b.{0,400}\bwrote:\s{0,20}$/i,
  // The same attribution in a few other languages ("Am … schrieb …:", "Le … a écrit :").
  /^\s{0,20}(am|le|el|il|op)\b.{0,400}(schrieb|a écrit|escribió|ha scritto|schreef).{0,40}:\s{0,20}$/i,
  // Outlook.
  /^\s{0,20}-{2,20}\s{0,5}original message\s{0,5}-{2,20}\s{0,20}$/i,
  /^\s{0,20}_{10,200}\s{0,20}$/,
];

// Outlook's header block without a separator line: "From:" followed within a few lines by "Sent:"/"Date:".
const OUTLOOK_FROM = /^\s{0,20}\*?(from|von|de):\*?\s/i;
const OUTLOOK_NEXT = /^\s{0,20}\*?(sent|date|to|subject|gesendet|envoyé|enviado):\*?\s/i;

// Signatures: the standard delimiter, and the lines phones and apps add.
const SIGNATURES: RegExp[] = [
  /^-- ?$/,
  /^\s{0,20}sent from my (iphone|ipad|android|samsung|galaxy|pixel|mobile|phone|blackberry)\b/i,
  /^\s{0,20}sent from (outlook|mail for windows|yahoo mail|proton mail|my mobile device)\b/i,
  /^\s{0,20}get outlook for (ios|android)\s{0,20}$/i,
  /^\s{0,20}sent with proton mail\b/i,
];

/** Cut `html` at the first `needle` (lower-cased search), back to the start of the tag that holds it. */
function cutAtTag(html: string, lower: string, needle: string, tagStart: string): { html: string; lower: string } {
  const at = lower.indexOf(needle);
  if (at < 0) return { html, lower };
  const start = lower.lastIndexOf(tagStart, at);
  const end = start >= 0 ? start : at;
  return { html: html.slice(0, end), lower: lower.slice(0, end) };
}

/** Remove every `<tag …>…</tag>` block, scanning forward once. */
function removeBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let from = 0;
  for (;;) {
    const open = lower.indexOf(`<${tag}`, from);
    if (open < 0) break;
    out += html.slice(from, open);
    const close = lower.indexOf(`</${tag}>`, open);
    if (close < 0) return out;
    from = close + tag.length + 3;
  }
  return out + html.slice(from);
}

/** HTML to text, after Gmail's, Apple Mail's and Outlook's quote blocks are removed. Linear in the input, which is cut to `MAX_EMAIL_CHARS`. @stability Beta */
export function htmlToText(html: string): string {
  let h = html.slice(0, MAX_EMAIL_CHARS);
  for (const tag of ["style", "script", "head"]) h = removeBlocks(h, tag);
  let cut = { html: h, lower: h.toLowerCase() };
  cut = cutAtTag(cut.html, cut.lower, "gmail_quote", "<div");
  cut = cutAtTag(cut.html, cut.lower, "<blockquote", "<blockquote");
  cut = cutAtTag(cut.html, cut.lower, 'id="appendonsend"', "<div");
  cut = cutAtTag(cut.html, cut.lower, 'id="divrplyfwdmsg"', "<div");
  return cut.html
    .replace(/<br\s{0,5}\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^<>]{0,2000}>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function isQuoteHeader(line: string): boolean {
  if (line.length > 2000) return false;
  if (line.toLowerCase().replace(/^[\s>]+/, "").startsWith(REPLY_MARKER.toLowerCase())) return true;
  return QUOTE_HEADERS.some((r) => r.test(line));
}

/** The reply's own text: no quoted history, no marker, no signature; trimmed and capped. @stability Beta */
export function stripReply(text: string, html?: string | null): string {
  const body = (text ?? "").slice(0, MAX_EMAIL_CHARS);
  const source = body.trim() ? body : html ? htmlToText(html) : "";
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Gmail wraps a long attribution over two or three lines: "On … <x@y.test>" … "wrote:".
    const startsOn = /^\s{0,20}on\b/i.test(line);
    const two = i + 1 < lines.length ? `${line} ${lines[i + 1]!.trim()}` : line;
    const three = i + 2 < lines.length ? `${two} ${lines[i + 2]!.trim()}` : two;
    if (isQuoteHeader(line) || (startsOn && (isQuoteHeader(two) || isQuoteHeader(three)))) {
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
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}
