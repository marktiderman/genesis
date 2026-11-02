// @feat:calendar-read-layer
import type { FetchedResponse, Transport } from "@marktiderman/genesis-media/server";
import { describe, expect, it } from "vitest";
import { CalendarFeedError, fetchFeed, toFeedUrl } from "./fetch";

const SECRET = "https://calendar.example/ical/private-9f8e7d6c/basic.ics";

function respond(status: number, body: string, headers: Record<string, string> = {}): FetchedResponse {
  const bytes = new TextEncoder().encode(body);
  return {
    status,
    headers,
    body: (async function* () {
      yield bytes;
    })(),
    cancel() {},
  };
}

function fake(pages: ((url: URL) => FetchedResponse)[]): { transport: Transport; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    transport: async (url) => {
      urls.push(url.href);
      const page = pages.shift();
      if (!page) throw new Error("unexpected call");
      return page(url);
    },
  };
}

const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as CalendarFeedError);

describe("toFeedUrl", () => {
  it("reads webcal as https and refuses http and credentials", () => {
    expect(toFeedUrl(" webcal://calendar.example/a.ics ").href).toBe("https://calendar.example/a.ics");
    expect(() => toFeedUrl("http://calendar.example/a.ics")).toThrow(CalendarFeedError);
    expect(() => toFeedUrl("https://user:pw@calendar.example/a.ics")).toThrow(/user name or password/);
    expect(() => toFeedUrl("not a url")).toThrow(/isn't a URL/);
  });
});

describe("fetchFeed", () => {
  it("returns the feed's text, its byte-order mark dropped", async () => {
    const g = fake([() => respond(200, "﻿BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")]);
    expect(await fetchFeed(SECRET.replace("https", "webcal"), { transport: g.transport })).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(g.urls).toEqual([SECRET]);
  });

  it("refuses a feed over the size cap, a redirect down to http and a private address, never naming the link", async () => {
    const big = fake([() => respond(200, "x".repeat(2000))]);
    const tooBig = await failure(fetchFeed(SECRET, { transport: big.transport, maxBytes: 1000 }));
    expect(tooBig?.code).toBe("refused");

    const down = fake([() => respond(302, "", { location: "http://calendar.example/plain.ics" })]);
    const downgraded = await failure(fetchFeed(SECRET, { transport: down.transport }));
    expect(downgraded?.code).toBe("refused");

    const internal = await failure(fetchFeed("https://127.0.0.1/private-9f8e7d6c.ics", { transport: fake([]).transport }));
    expect(internal?.code).toBe("refused");

    for (const e of [tooBig, downgraded, internal]) expect(e!.message).not.toContain("private-9f8e7d6c");
  });

  it("reports a network failure as unavailable, without the link", async () => {
    const broken: Transport = async () => {
      throw new Error(`connect ECONNREFUSED for ${SECRET}`);
    };
    const error = await failure(fetchFeed(SECRET, { transport: broken }));
    expect(error?.code).toBe("unavailable");
    expect(error!.message).not.toContain("private-9f8e7d6c");
  });

  it("never names a refused host, where a feed's secret can live", async () => {
    const error = await failure(fetchFeed("https://127.0.0.1/a.ics", { transport: fake([]).transport }));
    expect(error?.code).toBe("refused");
    expect(error!.message).not.toContain("127.0.0.1");
  });

  it("keeps its deadline when a transport ignores the abort signal", async () => {
    const hangs: Transport = () => new Promise(() => {});
    const error = await failure(fetchFeed(SECRET, { transport: hangs, timeoutMs: 20 }));
    expect(error?.code).toBe("unavailable");
  });

  it("refuses a size cap or timeout that isn't a positive number", async () => {
    await expect(fetchFeed(SECRET, { transport: fake([]).transport, maxBytes: Number.NaN })).rejects.toThrow(RangeError);
    await expect(fetchFeed(SECRET, { transport: fake([]).transport, timeoutMs: 0 })).rejects.toThrow(RangeError);
  });
});
