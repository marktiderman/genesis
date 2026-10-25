// The genesis-sites demo: two made-up brands served by handleSiteRequest from
// a memory store. Riverside Gym is the one-click landing page (landingPage
// from a brand and a message); Hilltop Fitness is the three-page starter site.
// A real app mounts handleSiteRequest on its own server with the Supabase
// store; see packages/sites/README.md.
//
//   /sites-demo/landing/        the landing page
//   /sites-demo/starter/        home, /about and /contact
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

const brands: Record<"landing" | "starter", SiteBrand> = {
  landing: exampleBrands.riverside,
  starter: exampleBrands.hilltop,
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
  return store;
}

let storePromise: ReturnType<typeof buildStore> | null = null;
const demoStore = () => (storePromise ??= buildStore());

const forms: FormsResolver = (slug) =>
  slug === "free-class" ? { kind: "definition", definition: freeClass.definition, submitUrl: "/api/forms/free-class", submitLabel: "Book my class" } : null;

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
  if (/^\/(landing|starter)\/api\/forms\/[a-z0-9-]+$/.test(rest)) {
    if (request.method !== "POST") return new Response("Method not allowed\n", { status: 405, headers: { allow: "POST" } });
    return Response.json({ ok: true, stored: false });
  }

  // The editor demo's uploads (app/routes/sites-editor.tsx): raster images only, kept in memory.
  if (rest === "/uploads" || rest.startsWith("/uploads/")) return handleUpload(request, rest, root);

  const site = rest.split("/")[1];
  if (site !== "landing" && site !== "starter") return null;
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
const uploads = new Map<string, { type: string; body: ArrayBuffer }>();

/** The editor demo's uploads: POST an image, GET it back. At most 20 of 5 MB, in this server's memory. */
async function handleUpload(request: Request, rest: string, root: string): Promise<Response> {
  if (request.method === "POST" && rest === "/uploads") {
    const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!UPLOAD_TYPES.has(type)) return new Response("Only PNG, JPEG, WebP, AVIF or GIF images.\n", { status: 415 });
    if (Number(request.headers.get("content-length") ?? 0) > 5 * 1024 * 1024) return new Response("At most 5 MB.\n", { status: 413 });
    const body = await request.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) return new Response("At most 5 MB.\n", { status: 413 });
    const name = (new URL(request.url).searchParams.get("name") ?? "image").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(0, 60);
    const id = `${Date.now().toString(36)}-${name}`;
    uploads.set(id, { type, body });
    while (uploads.size > 20) uploads.delete(uploads.keys().next().value!);
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
  for (const site of ["landing", "starter"] as const) {
    const live = await store.getLive(site);
    for (const page of live?.snapshot.pages ?? []) out.push(`${DEMO_PREFIX}/${site}${page.path}`); // the home page is /sites-demo/<site>/, its one address
  }
  return out;
}
