/**
 * @marktiderman/genesis-calendar/fetch: fetching an iCal feed a person gave, on a server, through
 * genesis-media's guarded fetch (an optional peer, loaded on first use). A secret iCal link is a
 * credential: it is never logged, and no error this module throws names it.
 *
 * @packageDocumentation
 */
import type { GuardedFetchOptions, Transport } from "@marktiderman/genesis-media/server";

/** Why a feed wasn't fetched. @stability Beta */
export type CalendarFeedErrorCode =
  /** Not a URL, not https (or webcal), or with a user name or password in it. */
  | "invalid_url"
  /** The guard or a limit refused it: a private address, too many redirects, too big, a non-200. */
  | "refused"
  /** The network or the server failed, or it took too long. */
  | "unavailable"
  /** `@marktiderman/genesis-media` isn't installed. */
  | "missing_peer";

/** A feed that wasn't fetched. The message is safe to show and never holds the URL. @stability Beta */
export class CalendarFeedError extends Error {
  readonly code: CalendarFeedErrorCode;
  constructor(code: CalendarFeedErrorCode, message: string) {
    super(message);
    this.name = "CalendarFeedError";
    this.code = code;
  }
}

/** What `fetchFeed` takes. @stability Beta */
export interface FetchFeedOptions {
  /** The largest feed, in bytes. Default 5 MiB. */
  maxBytes?: number;
  /** The time the fetch may take, redirects included, in ms. Default 15 s. */
  timeoutMs?: number;
  /** Replaces genesis-media's guarded transport (tests, another runtime). It must keep the address guard. */
  transport?: Transport;
}

type MediaServer = typeof import("@marktiderman/genesis-media/server");

let media: Promise<MediaServer> | null = null;
const loadMedia = () => (media ??= import("@marktiderman/genesis-media/server"));

/**
 * The URL to fetch for a feed link: `webcal://` read as `https://`, and anything that isn't
 * https, or carries a user name or password, refused.
 *
 * @stability Beta
 */
export function toFeedUrl(link: string): URL {
  const raw = link.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CalendarFeedError("invalid_url", "The calendar link isn't a URL.");
  }
  if (url.protocol !== "https:") throw new CalendarFeedError("invalid_url", "The calendar link must be https (or webcal).");
  if (url.username || url.password) throw new CalendarFeedError("invalid_url", "The calendar link can't hold a user name or password.");
  return url;
}

/**
 * GETs an iCal feed and returns its text, for `readIcs`. https only (a `webcal://` link is read as
 * https), no credentials in the URL, and genesis-media's guard: only public addresses, checked
 * when the socket connects, redirects checked and never down to http, a size cap and a timeout.
 * Throws `CalendarFeedError`. Server only (Node).
 *
 * @stability Beta
 */
export async function fetchFeed(link: string, options: FetchFeedOptions = {}): Promise<string> {
  const url = toFeedUrl(link);
  let server: MediaServer;
  try {
    server = await loadMedia();
  } catch {
    media = null;
    throw new CalendarFeedError("missing_peer", "fetchFeed needs @marktiderman/genesis-media installed.");
  }
  const guarded: GuardedFetchOptions = {
    maxBytes: options.maxBytes ?? 5 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 15_000,
    transport: options.transport ?? server.createGuardedTransport({ accept: "text/calendar, text/plain;q=0.5, */*;q=0.1", userAgent: "genesis-calendar/1" }),
  };
  try {
    const { bytes } = await server.fetchGuarded(url.href, guarded);
    return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  } catch (error) {
    // Media's reasons name a host at most, never the path or query where a feed's secret lives.
    if (error instanceof server.FetchRefusedError) throw new CalendarFeedError("refused", `The calendar wasn't fetched: ${error.message}`);
    throw new CalendarFeedError("unavailable", "The calendar couldn't be reached.");
  }
}
