// genesis-sites in the sample app: two made-up brands' sites, served by
// handleSiteRequest from sites-demo/ (a Vite middleware in dev and preview,
// static files in the Pages build). The frames show the real pages: server
// HTML, no hydration, one small script for the menu and the form.
import { Link } from "react-router";
import { Globe } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

const SITES = [
  {
    id: "landing",
    title: "Riverside Gym: a one-click landing page",
    description: "landingPage() from the brand and a message: nav, hero, features, quotes, a call to action, the free-class form and the footer.",
    pages: [{ label: "Home", path: "/" }],
  },
  {
    id: "starter",
    title: "Hilltop Fitness: a three-page starter site",
    description: "starterSite(): a home, about and contact page, with the menu, breadcrumbs in JSON-LD and the same form.",
    pages: [
      { label: "Home", path: "/" },
      { label: "About", path: "/about" },
      { label: "Contact", path: "/contact" },
    ],
  },
  {
    id: "classes",
    title: "Riverside Gym: a full multi-page site",
    description: "The V1 sections: a timetable (a day picker on a phone), coaches with bios that open in place, plans in groups with a download, a six-week course, a map that loads only when asked, and a blog with posts, RSS and Article JSON-LD.",
    pages: [
      { label: "Home", path: "/" },
      { label: "Timetable", path: "/timetable" },
      { label: "Coaches", path: "/coaches" },
      { label: "Plans", path: "/plans" },
      { label: "Course", path: "/course" },
      { label: "Visit", path: "/visit" },
      { label: "Blog", path: "/blog" },
      { label: "A post", path: "/blog/first-class-tips" },
    ],
  },
];

const href = (site: string, path: string) => `${BASE}/sites-demo/${site}${path === "/" ? "/" : path}`;

export default function Sites() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        subtitle="@marktiderman/genesis-sites: pages from a brand, rendered on the server with no hydration."
        icon={Globe}
      />
      <Card>
        <CardHeader>
          <CardTitle>The site editor</CardTitle>
          <CardDescription>
            @marktiderman/genesis-sites/editor on a made-up studio's landing page: add sections, edit them on the page, publish (the checks run first), then view the live page or roll back.
          </CardDescription>
          <div className="pt-2">
            <Button asChild size="sm">
              <Link to="/sites-editor">Open the editor</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>
      {SITES.map((site) => (
        <Card key={site.id}>
          <CardHeader>
            <CardTitle>{site.title}</CardTitle>
            <CardDescription>{site.description}</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {site.pages.map((page) => (
                <Button key={page.path} asChild variant="outline" size="sm">
                  <a href={href(site.id, page.path)} target="_blank" rel="noreferrer">
                    Open {page.label}
                  </a>
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_390px]">
            <iframe title={`${site.title}, desktop`} src={href(site.id, "/")} className="h-[640px] w-full rounded-md border border-border bg-background" loading="lazy" />
            <iframe title={`${site.title}, phone`} src={href(site.id, "/")} className="h-[640px] w-full max-w-[390px] rounded-md border border-border bg-background" loading="lazy" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
