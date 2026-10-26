/** @feat:chat Moderation mapping and the SSRF-safe link unfurler. */
import { describe, expect, it, vi } from "vitest";
import { carriesCredential, createLinkUnfurler, guardedLookup, isPrivateAddress, moderationVerdict, openAiModerator, parseOpenGraph } from "../server";
import { fakeFetch, jsonResponse } from "./server-fakes";

describe("moderationVerdict", () => {
  it("maps scores to clean, flagged and hidden with default thresholds", () => {
    expect(moderationVerdict({ harassment: 0.1, violence: 0.2 })).toEqual({ result: "clean" });
    expect(moderationVerdict({ harassment: 0.6 })).toEqual({ result: "flagged", reason: "Automatic moderation: harassment 0.60" });
    expect(moderationVerdict({ harassment: 0.95, violence: 0.55 })).toEqual({
      result: "hidden",
      reason: "Automatic moderation: harassment 0.95, violence 0.55",
    });
  });

  it("is stricter for sexual/minors and softer to flag self-harm by default", () => {
    expect(moderationVerdict({ "sexual/minors": 0.55 }).result).toBe("hidden");
    expect(moderationVerdict({ "self-harm/intent": 0.35 }).result).toBe("flagged");
    expect(moderationVerdict({ "self-harm/intent": 0.92 }).result).toBe("flagged");
  });

  it("takes configured thresholds, and the provider's flag", () => {
    expect(moderationVerdict({ harassment: 0.6 }, { thresholds: { flag: 0.7 } }).result).toBe("clean");
    expect(moderationVerdict({ violence: 0.6 }, { categories: { violence: { hide: 0.5 } } }).result).toBe("hidden");
    expect(moderationVerdict({ harassment: 0.1 }, { flagged: true }).result).toBe("flagged");
  });
});

describe("openAiModerator", () => {
  it("sends text with the first photo, further photos alone, and keeps the highest scores", async () => {
    const f = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init!.body)) as { input: { type: string }[] };
      const withText = body.input.some((i) => i.type === "text");
      return jsonResponse({ results: [{ flagged: false, category_scores: withText ? { harassment: 0.2, violence: 0.1 } : { violence: 0.93 } }] });
    });
    const verdict = await openAiModerator({ apiKey: "sk-test", fetch: f.fetch }).moderate({ text: "hi", imageUrls: ["https://f.test/1", "https://f.test/2"] });
    expect(verdict).toEqual({ result: "hidden", reason: "Automatic moderation: violence 0.93" });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]!.url).toBe("https://api.openai.com/v1/moderations");
    expect((f.calls[0]!.init!.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(f.calls[0]!.init!.body))).toEqual({
      model: "omni-moderation-latest",
      input: [
        { type: "text", text: "hi" },
        { type: "image_url", image_url: { url: "https://f.test/1" } },
      ],
    });
  });

  it("throws on an HTTP error so the effect retries", async () => {
    const m = openAiModerator({ apiKey: "k", fetch: fakeFetch(() => new Response("no", { status: 429 })).fetch });
    await expect(m.moderate({ text: "x", imageUrls: [] })).rejects.toThrow("HTTP 429");
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "[::1]",
    "fe80::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "::ffff:0:7f00:1", // IPv4-translated 127.0.0.1
    "::ffff:0:a00:1", // IPv4-translated 10.0.0.1
    "2002:7f00:1::", // 6to4 of 127.0.0.1
    "2002:a9fe:a9fe::1", // 6to4 of 169.254.169.254
    "2001::1", // Teredo
    "64:ff9b:1::1", // local-use NAT64
    "3fff::1", // documentation
    "192.88.99.1", // 6to4 relay
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "::ffff:93.184.216.34", "2002:5db8:d822::1", "2001:4860:4860::8888"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

const html = (head: string, extra = "") => `<!doctype html><html><head>${head}</head><body>${extra}</body></html>`;
const page = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const publicDns = async () => ["93.184.216.34"];

describe("createLinkUnfurler", () => {
  it("parses Open Graph data with entities, caps and an https image", async () => {
    const f = fakeFetch(() =>
      page(
        html(
          `<title>Fallback</title><meta property="og:title" content="Tom &amp; Jerry&#39;s &#x1F600; plan">` +
            `<meta content='Week   3\n of 12' property='og:description'><meta property="og:image" content="/img/cover.png">` +
            `<meta property="og:site_name" content="Coach&nbsp;Co">`,
        ),
      ),
    );
    const preview = await createLinkUnfurler({ fetch: f.fetch, resolve: publicDns }).unfurl("https://coach.example/plan");
    expect(preview).toEqual({
      url: "https://coach.example/plan",
      status: "ok",
      title: "Tom & Jerry's \u{1F600} plan",
      description: "Week 3 of 12",
      imageUrl: "https://coach.example/img/cover.png",
      siteName: "Coach Co",
    });
    expect(f.calls[0]!.init!.redirect).toBe("manual");
  });

  it("falls back to <title> and meta description, caps lengths and drops a non-https image", () => {
    const og = parseOpenGraph(
      html(`<title>  A   page  </title><meta name="description" content="${"d".repeat(700)}"><meta property="og:image" content="http://x.example/i.png">`),
      "https://x.example/",
    );
    expect(og.title).toBe("A page");
    expect(og.description).toHaveLength(600);
    expect(og.imageUrl).toBeNull();
  });

  it("ignores tags outside the head and inside scripts or comments", () => {
    const og = parseOpenGraph(
      `<head><!-- <meta property="og:title" content="comment"> --><script>var s='<meta property="og:title" content="script">'</script>` +
        `<meta property="og:title" content="real"></head><body><meta property="og:description" content="body"></body>`,
      "https://x.example/",
    );
    expect(og).toMatchObject({ title: "real", description: null });
  });

  // Each of these took seconds when every unclosed start rescanned to the end of the page.
  it.each([
    ["unclosed scripts", "<script "],
    ["unclosed comments", "<!--"],
    ["unclosed metas", "<meta "],
    ["unclosed titles", "<title>"],
    ["an attribute's open quotes", "<meta x='"],
    ["a long attribute name", "a"],
    ["unclosed tags in a title", "<title>" + "<".repeat(1000)],
  ])("parses a 512 KiB page of %s in linear time", (_, unit) => {
    // Time grows with the page, not its square: four times the bytes may take about four times as
    // long (quadratic would take sixteen). Compared against the same machine's smaller page, so a
    // slow CI runner can't fail it; the best of three runs keeps a pause from counting.
    const timeFor = (bytes: number) => {
      const page = unit.repeat(Math.ceil(bytes / unit.length));
      const html = unit === "a" ? `<meta ${page}>` : page;
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        parseOpenGraph(html, "https://x.example/");
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    const small = timeFor(128 * 1024);
    const large = timeFor(512 * 1024);
    expect(large).toBeLessThan(small * 10 + 50);
  });

  it("still reads a title and an unclosed script runs to the end", () => {
    expect(parseOpenGraph(`<title>Hi</title><script>var x = 1;<meta property="og:title" content="no">`, "https://x.example/").title).toBe("Hi");
  });

  it.each([
    ["http://coach.example/", "blocked"],
    ["https://127.0.0.1/", "blocked"],
    ["https://[::1]/", "blocked"],
    ["https://169.254.169.254/latest/meta-data", "blocked"],
    ["https://2130706433/", "blocked"],
    ["https://localhost/", "blocked"],
    ["https://metadata.google.internal/", "blocked"],
    ["https://intranet/", "blocked"],
    ["https://user:pw@coach.example/", "blocked"],
    ["https://coach.example:8443/", "blocked"],
  ])("refuses %s without fetching", async (url, status) => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    expect((await createLinkUnfurler({ fetch: f.fetch, resolve: publicDns }).unfurl(url)).status).toBe(status);
    expect(f.calls).toHaveLength(0);
  });

  it("refuses a name that resolves to a private address", async () => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    const u = createLinkUnfurler({ fetch: f.fetch, resolve: async () => ["93.184.216.34", "10.0.0.5"] });
    expect((await u.unfurl("https://sneaky.example/")).status).toBe("blocked");
    expect(f.calls).toHaveLength(0);
  });

  it("checks every redirect hop, and refuses a redirect into a private address", async () => {
    const f = fakeFetch((url) =>
      url === "https://coach.example/a"
        ? new Response(null, { status: 302, headers: { location: "https://internal.example/admin" } })
        : page(html("<title>secret</title>")),
    );
    const resolve = async (host: string) => (host === "internal.example" ? ["192.168.0.10"] : ["93.184.216.34"]);
    expect((await createLinkUnfurler({ fetch: f.fetch, resolve }).unfurl("https://coach.example/a")).status).toBe("blocked");
    expect(f.calls.map((c) => c.url)).toEqual(["https://coach.example/a"]);

    const literal = fakeFetch(() => new Response(null, { status: 301, headers: { location: "https://169.254.169.254/" } }));
    expect((await createLinkUnfurler({ fetch: literal.fetch, resolve: publicDns }).unfurl("https://coach.example/")).status).toBe("blocked");
    const downgrade = fakeFetch(() => new Response(null, { status: 301, headers: { location: "http://coach.example/" } }));
    expect((await createLinkUnfurler({ fetch: downgrade.fetch, resolve: publicDns }).unfurl("https://coach.example/")).status).toBe("blocked");
  });

  it("follows at most 3 redirects", async () => {
    let n = 0;
    const f = fakeFetch(() => new Response(null, { status: 302, headers: { location: `/hop${++n}` } }));
    expect((await createLinkUnfurler({ fetch: f.fetch, resolve: publicDns }).unfurl("https://coach.example/")).status).toBe("failed");
    expect(f.calls).toHaveLength(4);

    let m = 0;
    const ok = fakeFetch(() => (++m <= 3 ? new Response(null, { status: 302, headers: { location: `/hop${m}` } }) : page(html("<title>Here</title>"))));
    expect(await createLinkUnfurler({ fetch: ok.fetch, resolve: publicDns }).unfurl("https://coach.example/")).toMatchObject({ status: "ok", title: "Here" });
  });

  it("fails on non-HTML, a declared oversize body, an HTTP error or a network error", async () => {
    const run = (respond: () => Response | Promise<Response>, maxBytes?: number) =>
      createLinkUnfurler({ fetch: fakeFetch(respond).fetch, resolve: publicDns, ...(maxBytes ? { maxBytes } : {}) }).unfurl("https://coach.example/");
    expect((await run(() => new Response("%PDF", { headers: { "content-type": "application/pdf" } }))).status).toBe("failed");
    expect((await run(() => new Response("{}", { headers: { "content-type": "application/json" } }))).status).toBe("failed");
    expect((await run(() => page(html("<title>x</title>"), { "content-length": "999999" }), 1000)).status).toBe("failed");
    expect((await run(() => new Response("gone", { status: 404, headers: { "content-type": "text/html" } }))).status).toBe("failed");
    expect((await run(() => Promise.reject(new TypeError("fetch failed")))).status).toBe("failed");
  });

  it("reads no more than maxBytes of an undeclared body", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode(pulled === 1 ? '<head><meta property="og:title" content="Top"></head>' : "x".repeat(1000)));
        if (pulled > 1000) controller.close();
      },
    });
    const f = fakeFetch(() => new Response(stream, { headers: { "content-type": "text/html" } }));
    expect(await createLinkUnfurler({ fetch: f.fetch, resolve: publicDns, maxBytes: 4096 }).unfurl("https://coach.example/")).toMatchObject({ status: "ok", title: "Top" });
    expect(pulled).toBeLessThan(10);
  });

  it("without a resolver, refuses every named host (logged once) unless allowUnresolved", async () => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    const log = vi.fn();
    const u = createLinkUnfurler({ fetch: f.fetch, resolve: async () => null, log });
    expect((await u.unfurl("https://10.0.0.1/")).status).toBe("blocked");
    expect((await u.unfurl("https://localtest.me/")).status).toBe("blocked");
    expect((await u.unfurl("https://coach.example/")).status).toBe("blocked");
    expect(f.calls).toHaveLength(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain("allowUnresolved");

    const opted = createLinkUnfurler({ fetch: f.fetch, resolve: async () => null, allowUnresolved: true, log });
    expect((await opted.unfurl("https://coach.example/")).status).toBe("ok");
    expect((await opted.unfurl("https://10.0.0.1/")).status).toBe("blocked");
  });

  it("times out a DNS lookup that hangs", async () => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    const u = createLinkUnfurler({ fetch: f.fetch, resolve: () => new Promise<string[]>(() => {}), timeoutMs: 50 });
    expect((await u.unfurl("https://slow.example/")).status).toBe("failed");
    expect(f.calls).toHaveLength(0);
  });

  it("never fetches a link whose query carries a credential", async () => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    const u = createLinkUnfurler({ fetch: f.fetch, resolve: publicDns });
    for (const url of ["https://app.example/reset?token=abc", "https://s3.example/f?X-Amz-Signature=1&a=b", "https://app.example/login?a=1&code=xyz"]) {
      expect((await u.unfurl(url)).status).toBe("blocked");
    }
    expect(f.calls).toHaveLength(0);
    expect(carriesCredential("https://app.example/page?ref=newsletter")).toBe(false);
  });

  it("drops an og:image whose host is private or local", async () => {
    const run = async (image: string, resolve: (host: string) => Promise<string[]> = publicDns) =>
      (await createLinkUnfurler({ fetch: fakeFetch(() => page(html(`<title>T</title><meta property="og:image" content="${image}">`))).fetch, resolve }).unfurl(
        "https://coach.example/",
      )).imageUrl;
    expect(await run("https://10.0.0.1/i.png")).toBeNull();
    expect(await run("https://intranet.local/i.png")).toBeNull();
    expect(await run("https://cdn.example/i.png", async (h) => (h === "cdn.example" ? ["192.168.1.9"] : ["93.184.216.34"]))).toBeNull();
    expect(await run("https://cdn.example/i.png?sig=abc")).toBe("https://cdn.example/i.png?sig=abc");
  });

  it("passes a dispatcher to fetch, and guardedLookup refuses a private answer at connect time", async () => {
    const f = fakeFetch(() => page(html("<title>x</title>")));
    const dispatcher = { pinned: true };
    await createLinkUnfurler({ fetch: f.fetch, resolve: publicDns, dispatcher }).unfurl("https://coach.example/");
    expect((f.calls[0]!.init as RequestInit & { dispatcher?: unknown }).dispatcher).toBe(dispatcher);

    const lookup = (host: string, all: boolean) =>
      new Promise<{ error: Error | null; address?: unknown }>((resolve) =>
        guardedLookup(host, { all }, (error, address) => resolve({ error, address })),
      );
    const local = await lookup("localhost", false);
    expect(local.error?.message).toContain("private address");
    const ip = await lookup("1.1.1.1", true);
    expect(ip.error).toBeNull();
    expect(ip.address).toEqual([{ address: "1.1.1.1", family: 4 }]);
  });
});
