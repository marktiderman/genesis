// The genesis-sites editor in the sample app: a made-up studio's landing
// page in a memory store, edited with <SiteEditor>. Publish runs the checks
// (the template's sample quotes block it until you replace or hide them),
// and "View it live" draws the published release through the /web renderer.
// Everything lives in this tab's memory; a reload starts again.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { createMemorySiteStore, exampleBrands, landingPage, type FormsResolver, type MemorySiteStore, type SiteBrand } from "@marktiderman/genesis-sites";
import { SiteEditor, type EditorAssets } from "@marktiderman/genesis-sites/editor";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";

const SITE_ID = "lakeside";

/** A made-up yoga studio, on one of the package's example palettes. */
const brand: SiteBrand = { ...exampleBrands.riverside, name: "Lakeside Yoga", fonts: { heading: "lora", body: "inter" } };

const trialForm = defineForm({
  id: "first-class",
  title: "Book your first class",
  layout: { mode: "classic" },
  blocks: [f.shortText("name", { label: "Your name", required: true }), f.email("email", { label: "Email", required: true })],
});

const forms: FormsResolver = (slug) =>
  slug === "first-class" ? { kind: "definition", definition: trialForm.definition, submitUrl: "/api/forms/first-class", submitLabel: "Book it" } : null;

let storePromise: Promise<MemorySiteStore> | null = null;
function demoStore(): Promise<MemorySiteStore> {
  storePromise ??= (async () => {
    const store = createMemorySiteStore();
    const t = landingPage({
      brand,
      message: {
        headline: "Slow down by the water",
        subhead: "Small, unhurried yoga classes for every body, morning and evening.",
        benefits: [
          { title: "Small classes", body: "Never more than ten mats, so the teacher sees you." },
          { title: "Every level", body: "Beginners welcome; every pose has an easier way in." },
          { title: "First class free", body: "Try a class before you choose a pass." },
        ],
      },
      form: { slug: "first-class", heading: "Book your first class" },
      contact: { email: "hello@lakeside.example" },
    });
    await store.createSite({ id: SITE_ID, site: { ...t.site, nav: [{ label: "Classes", href: "#contact" }] }, pages: t.pages });
    return store;
  })();
  return storePromise;
}

const UPLOADS = `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/sites-demo/uploads`;

/** Uploads go to the dev server's demo endpoint (sites-demo/site.ts); the static build has none. */
const assets: EditorAssets = {
  maxBytes: 5 * 1024 * 1024,
  async upload(_siteId, file, meta) {
    const res = await fetch(`${UPLOADS}?name=${encodeURIComponent(meta.name ?? "image")}`, { method: "POST", headers: { "content-type": file.type }, body: file });
    if (!res.ok) throw new Error(res.status === 404 ? "Uploads work in the dev server only." : `the demo server answered ${res.status}`);
    const { id, url } = (await res.json()) as { id: string; url: string };
    return { id, siteId: SITE_ID, path: `sites/${SITE_ID}/${id}`, url, mime: file.type, alt: meta.alt ?? null, width: meta.width ?? null, height: meta.height ?? null };
  },
};

export default function SitesEditorRoute() {
  const [store, setStore] = useState<MemorySiteStore | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  useEffect(() => {
    void demoStore().then(setStore);
  }, []);
  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/sites">
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Sites
            </Link>
          </Button>
          <span className="text-sm font-semibold">Site editor demo</span>
          <Badge variant="muted">Memory store: a reload starts again</Badge>
        </div>
        {published ? <Badge variant="success">Published release {published}</Badge> : null}
      </div>
      <div className="min-h-0 flex-1">
        {store ? <SiteEditor siteId={SITE_ID} store={store} brand={brand} forms={forms} assets={assets} onPublish={(r) => setPublished(r.number)} /> : null}
      </div>
    </div>
  );
}
