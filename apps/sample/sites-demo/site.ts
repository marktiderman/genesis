// The genesis-sites demo: made-up brands served by handleSiteRequest from a
// memory store. Riverside Gym is the one-click landing page (landingPage from
// a brand and a message) and a full multi-page site (classes.ts: timetable,
// coaches, plans, a course, a map and a blog); Hilltop Fitness is the
// three-page starter site.
// A real app mounts handleSiteRequest on its own server with the Supabase
// store; see packages/sites/README.md.
//
//   /sites-demo/landing/        the landing page
//   /sites-demo/starter/        home, /about and /contact
//   /sites-demo/classes/        the multi-page site (see classes.ts)
//   /sites-demo/<site>/api/forms/:slug
//                               the forms endpoint (answers 200; nothing is stored).
//                               /api is reserved, so handleSiteRequest leaves it to the app.
//   /sites-demo/uploads         the editor demo's image uploads (dev and preview servers only).
import { defineForm, f } from "@marktiderman/genesis-forms";
import {
  createMemorySiteStore,
  exampleBrands,
  landingPage,
  starterSite,
  type FormsResolver,
  type SectionNode,
  type SiteBrand,
} from "@marktiderman/genesis-sites";
import { handleSiteRequest } from "@marktiderman/genesis-sites/web";
import { buildClassesSite } from "./classes";

export const DEMO_PREFIX = "/sites-demo";

const freeClass = defineForm({
  id: "free-class",
  title: "Book a free class",
  layout: { mode: "classic" },
  blocks: [
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Email", required: true }),
    f.dropdown("time", {
      label: "Best time for you",
      options: [
        { value: "morning", label: "Mornings" },
        { value: "evening", label: "Evenings" },
        { value: "weekend", label: "Weekends" },
      ],
    }),
    f.consent("updates", { label: "Updates", text: "Send me the class timetable" }),
  ],
  endings: [{ id: "thanks", title: "Thanks! We'll be in touch within a day." }],
});

type DemoSite = "landing" | "starter" | "classes";
const SITE_IDS: readonly DemoSite[] = ["landing", "starter", "classes"];

const brands: Record<DemoSite, SiteBrand> = {
  landing: exampleBrands.riverside,
  starter: exampleBrands.hilltop,
  classes: exampleBrands.riverside,
};

// Made-up members' words for the demo, in place of the template's placeholders.
const quotes: Record<"landing" | "starter", { quote: string; name: string; role?: string }[]> = {
  landing: [
    { quote: "I never thought I'd enjoy training. Now I don't miss a week.", name: "Sam Lee", role: "Member since 2022" },
    { quote: "The coaches remember my goals, and my bad knee.", name: "Priya Shah", role: "Member since 2024" },
    { quote: "Small classes, real coaching, and the river at sunrise.", name: "Tom Okafor" },
  ],
  starter: [{ quote: "Every level means every level. I started from nothing.", name: "Jane Doe", role: "Member" }],
};

function replacePlaceholders(nodes: SectionNode[], site: "landing" | "starter"): SectionNode[] {
  return nodes.map((node) => {
    if (!node.placeholder) return node;
    if (node.type === "testimonials") return { ...node, placeholder: false, props: { ...node.props, items: quotes[site] } };
    if (node.type === "rich-text") {
      return {
        ...node,
        placeholder: false,
        props: {
          body: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Our story" }] },
              { type: "paragraph", content: [{ type: "text", text: "Hilltop Fitness began as a Saturday run club of six. Today we coach every level, from a first push-up to a first marathon." }] },
            ],
          },
        },
      };
    }
    return { ...node, placeholder: false };
  });
}

async function buildStore() {
  const store = createMemorySiteStore();
  const landing = landingPage({
    brand: brands.landing,
    message: {
      headline: "Train with people who know your name",
      subhead: "Small classes and real coaching by the river, for every level.",
      benefits: [
        { title: "Coached classes", body: "A coach in every class, never more than twelve of you." },
        { title: "Open gym", body: "Six days a week, from six in the morning." },
        { title: "A first class free", body: "Come and try it before you decide." },
      ],
    },
    form: { slug: "free-class", heading: "Book a free class", body: "Tell us a little about yourself and we'll reply within a day." },
    contact: { email: "hello@riverside.example", phone: "+1 555 0100" },
  });
  const starter = starterSite({
    brand: brands.starter,
    message: {
      headline: "Fitness on the hill, for every level",
      subhead: "Classes, coaching and a community that shows up for you.",
      benefits: [
        { title: "Every level", body: "Start where you are, with a coach who adjusts every move." },
        { title: "Classes all week", body: "Strength, conditioning and mobility, morning and evening." },
        { title: "Community", body: "Saturday runs, socials and people who notice when you're missing." },
      ],
    },
    form: { slug: "free-class", heading: "Book a free class" },
    contact: { email: "hello@hilltop.example" },
  });
  for (const [id, t] of [["landing", landing], ["starter", starter]] as const) {
    const pages = t.pages.map((p) => ({ ...p, doc: { ...p.doc, content: replacePlaceholders(p.doc.content, id) } }));
    await store.createSite({ id, site: t.site, pages });
    await store.publish(id, { brand: brands[id], note: "Demo" });
  }
  await buildClassesSite(store, brands.classes);
  return store;
}

/** A minimal one-page PDF that says the demo's prices. */
const PRICE_LIST_PDF = (() => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const text = "BT /F1 24 Tf 72 760 Td (Riverside Gym prices) Tj /F1 14 Tf 0 -40 Td (Free class: $0) Tj 0 -24 Td (Single visit: $20) Tj 0 -24 Td (Monthly: $99 a month) Tj 0 -24 Td (Yearly: $89 a month) Tj ET";
  objects[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
})();

let storePromise: ReturnType<typeof buildStore> | null = null;
const demoStore = () => (storePromise ??= buildStore());

// A genesis-forms form posted to the app's endpoint, and a mailto fallback (a button that writes an email).
const forms: FormsResolver = (slug) =>
  slug === "free-class"
    ? { kind: "definition", definition: freeClass.definition, submitUrl: "/api/forms/free-class", submitLabel: "Book my class" }
    : slug === "write-to-us"
      ? { kind: "mailto", email: "hello@riverside.example", subject: "A question for Riverside Gym", label: "Email us", note: "Write to the front desk and we'll reply by email." }
      : null;

/**
 * The demo's handler: a site's page, its assets or the forms endpoint, or null
 * for anything else under the app. `base` is the app's base URL path (`/`).
 */
export async function handleDemoRequest(request: Request, base = "/"): Promise<Response | null> {
  const root = `${base.replace(/\/+$/, "")}${DEMO_PREFIX}`;
  const url = new URL(request.url);
  if (url.pathname !== root && !url.pathname.startsWith(`${root}/`)) return null;
  const rest = url.pathname.slice(root.length);

  // The forms endpoint, where a real app runs genesis-forms' validateSubmission.
  if (/^\/(landing|starter|classes)\/api\/forms\/[a-z0-9-]+$/.test(rest)) {
    if (request.method !== "POST") return new Response("Method not allowed\n", { status: 405, headers: { allow: "POST" } });
    return Response.json({ ok: true, stored: false });
  }

  // The editor demo's uploads (app/routes/sites-editor.tsx): raster images only, kept in memory.
  if (rest === "/uploads" || rest.startsWith("/uploads/")) return handleUpload(request, rest, root);

  // The price list the plans page offers: a one-page PDF, made here (a real site stores it under sites/<id>/files/).
  if (rest === "/classes/files/riverside-prices.pdf") {
    return new Response(PRICE_LIST_PDF, { headers: { "content-type": "application/pdf", "cache-control": "public, max-age=3600" } });
  }

  const site = rest.split("/")[1] as DemoSite;
  if (!SITE_IDS.includes(site)) return null;
  const basePath = `${root}/${site}`;
  return handleSiteRequest(request, {
    store: await demoStore(),
    brand: { getBrand: () => brands[site] },
    siteId: site,
    basePath,
    origin: url.origin,
    // A site path: the renderer puts the site's base path in front of it.
    forms,
    unknownPath: "not-found",
  });
}

const UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOADS = 20;
const uploads = new Map<string, { type: string; body: ArrayBuffer }>();

/** The request body, or null once it passes `limit` bytes: reading stops there, so an oversized upload is never held whole. */
async function readBody(request: Request, limit: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

/**
 * The editor demo's uploads: POST an image, GET it back. At most 20 of 5 MB, in this server's memory.
 * The editor's pages live in the browser, so this server can't tell which images they still use:
 * none is ever dropped, and a 21st upload is refused until the server restarts.
 */
async function handleUpload(request: Request, rest: string, root: string): Promise<Response> {
  if (request.method === "POST" && rest === "/uploads") {
    const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!UPLOAD_TYPES.has(type)) return new Response("Only PNG, JPEG, WebP, AVIF or GIF images.\n", { status: 415 });
    if (uploads.size >= MAX_UPLOADS) return new Response(`The demo keeps at most ${MAX_UPLOADS} uploads. Restart the dev server to upload more.\n`, { status: 507 });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return new Response("At most 5 MB.\n", { status: 413 });
    const body = await readBody(request, MAX_UPLOAD_BYTES);
    if (!body) return new Response("At most 5 MB.\n", { status: 413 });
    const name = (new URL(request.url).searchParams.get("name") ?? "image").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(0, 60);
    // Unique per upload: two of the same name never share an address.
    const id = `${crypto.randomUUID()}-${name}`;
    uploads.set(id, { type, body });
    return Response.json({ id, url: `${root}/uploads/${id}` });
  }
  const file = uploads.get(rest.slice("/uploads/".length));
  if (request.method === "GET" && file) {
    return new Response(file.body, { headers: { "content-type": file.type, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "cache-control": "no-store" } });
  }
  return new Response("Not found\n", { status: 404 });
}

/** Every page of both demo sites, for the static build. */
export async function demoPaths(): Promise<string[]> {
  const store = await demoStore();
  const out: string[] = [];
  for (const site of SITE_IDS) {
    const live = await store.getLive(site);
    for (const page of live?.snapshot.pages ?? []) out.push(`${DEMO_PREFIX}/${site}${page.path}`); // the home page is /sites-demo/<site>/, its one address
    // Each post, under the post page.
    const blog = live?.snapshot.pages.find((p) => p.kind === "post");
    if (blog) for (const post of await store.listLivePosts!(site)) out.push(`${DEMO_PREFIX}/${site}${blog.path}/${post.slug}`);
  }
  out.push(`${DEMO_PREFIX}/classes/files/riverside-prices.pdf`);
  return out;
}
