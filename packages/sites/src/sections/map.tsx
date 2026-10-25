/**
 * A map, loaded only when the visitor asks for it.
 *
 * The page carries the address as text, a static picture (when there is
 * one) and a link to the map provider. No map frame is in the HTML: the
 * islands loader shows a "Show the map" button, and only a click puts the
 * provider's iframe on the page, so nothing from the provider loads (or
 * tracks) before the visitor chooses it. Without script, the link opens the
 * map instead.
 *
 * The frame's URL is built here from the address or the coordinates, for
 * OpenStreetMap or Google Maps: an editor never types a frame URL, and the
 * page's Content-Security-Policy allows exactly that provider.
 */
import { z } from "zod";
import { MapPin } from "lucide-react";
import { buttonVariants } from "@marktiderman/genesis-ui/button";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Link, Surface } from "../core/schemas";
import { Actions, Anchor, SectionBand, SectionTitle, SiteImage, TextLink, onAccent, titleId } from "./shared";

export const MAP_PROVIDERS = {
  openstreetmap: { name: "OpenStreetMap", origin: "https://www.openstreetmap.org" },
  google: { name: "Google Maps", origin: "https://www.google.com" },
} as const;
export type MapProvider = keyof typeof MAP_PROVIDERS;

const schema = z
  .object({
    eyebrow: Line(60).optional(),
    heading: Line(90),
    body: Copy(320).optional(),
    /** The address, a line each. */
    address: z.array(Line(120)).min(1).max(5),
    provider: z.enum(["openstreetmap", "google"]).default("openstreetmap"),
    /** What the map looks up (Google): default, the address. */
    query: Line(200).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    zoom: z.number().int().min(3).max(19).default(15),
    /** The map frame's accessible name. Default: "Map of <first address line>". */
    title: Line(120).optional(),
    /** A picture of the map, shown until the map loads (and instead of it without script). */
    image: Image.optional(),
    /** Phone, email and the like, under the address. */
    contact: z.array(Link).max(4).default([]),
    /** Buttons under the address. */
    primaryCta: Link.optional(),
    secondaryCta: Link.optional(),
    loadLabel: Line(40).default("Show the map"),
    /** Said before the map loads: who it comes from. */
    consentNote: Copy(200).optional(),
    surface: Surface.default("base"),
    anchor: Anchor,
  })
  .refine((p) => p.provider !== "openstreetmap" || (p.lat !== undefined && p.lng !== undefined), {
    message: "An OpenStreetMap map needs the place's latitude and longitude.",
    path: ["lat"],
  });
type Props = z.infer<typeof schema>;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The provider's embed URL for these props: built here, never typed by an editor. */
export function mapEmbedUrl(props: Pick<Props, "provider" | "query" | "address" | "lat" | "lng" | "zoom">): string {
  if (props.provider === "google") {
    const q = props.query ?? (props.lat !== undefined && props.lng !== undefined ? `${round(props.lat)},${round(props.lng)}` : props.address.join(", "));
    return `${MAP_PROVIDERS.google.origin}/maps?q=${encodeURIComponent(q)}&z=${props.zoom}&output=embed`;
  }
  const lat = round(props.lat ?? 0);
  const lng = round(props.lng ?? 0);
  const span = 180 / 2 ** props.zoom;
  const bbox = [lng - span, lat - span / 2, lng + span, lat + span / 2].map(round).join(",");
  return `${MAP_PROVIDERS.openstreetmap.origin}/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** The provider's own page for the place: the link that works without script. */
export function mapPageUrl(props: Pick<Props, "provider" | "query" | "address" | "lat" | "lng" | "zoom">): string {
  if (props.provider === "google") {
    const q = props.query ?? (props.lat !== undefined && props.lng !== undefined ? `${round(props.lat)},${round(props.lng)}` : props.address.join(", "));
    return `${MAP_PROVIDERS.google.origin}/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  const lat = round(props.lat ?? 0);
  const lng = round(props.lng ?? 0);
  return `${MAP_PROVIDERS.openstreetmap.origin}/?mlat=${lat}&mlon=${lng}#map=${props.zoom}/${lat}/${lng}`;
}

export const mapSection = defineSection({
  type: "map",
  version: 1,
  label: "Map",
  description: "Your address with a map that loads only when the visitor asks for it (OpenStreetMap or Google Maps), a picture until then, and a link to the provider.",
  category: "content",
  islands: true,
  frameOrigins: (props: Props) => [MAP_PROVIDERS[props.provider].origin],
  schema,
  variants: [
    { id: "split", label: "Address beside the map" },
    { id: "stacked", label: "Map above the address" },
  ],
  defaultVariant: "split",
  presets: [
    {
      name: "Find us",
      variant: "split",
      props: { heading: "Find us", address: ["1 River Road", "Riverside"], provider: "openstreetmap", lat: 51.5007, lng: -0.1246 },
    },
    {
      name: "Map and address",
      variant: "stacked",
      props: { heading: "Visit", address: ["1 River Road", "Riverside"], provider: "google", query: "1 River Road, Riverside" },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const provider = MAP_PROVIDERS[props.provider];
    const frameTitle = props.title ?? `Map of ${props.address[0]}`;
    const note = props.consentNote ?? `The map comes from ${provider.name}, which may set cookies. It loads only if you ask for it.`;
    const map = (
      <div
        data-gs-island="map"
        data-gs-map-src={mapEmbedUrl(props)}
        data-gs-map-title={frameTitle}
        className="relative isolate flex aspect-[4/3] w-full flex-col justify-end overflow-hidden rounded-xl border border-border bg-muted text-foreground"
      >
        {props.image ? (
          <SiteImage image={props.image} ctx={ctx} sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        ) : (
          <MapPin aria-hidden="true" className="absolute left-1/2 top-1/3 -z-10 size-12 -translate-x-1/2 text-muted-foreground" />
        )}
        <div className="flex flex-col items-start gap-3 bg-background p-4 text-foreground">
          <p className="text-sm">{note}</p>
          <div className="flex flex-wrap items-center gap-4">
            {/* Shown by the islands loader; without script the link below opens the map. */}
            <button type="button" data-gs-map-load="" hidden className={cn(buttonVariants({ variant: "default", size: "lg" }), "min-h-11")}>
              {props.loadLabel}
            </button>
            <TextLink link={{ label: `Open in ${provider.name}`, href: mapPageUrl(props), external: true, target: "_blank" }} ctx={ctx} className="text-sm font-medium underline" />
          </div>
        </div>
      </div>
    );
    const copy = (
      <div className="flex flex-col gap-4">
        {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider">{props.eyebrow}</p> : null}
        <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
          {props.heading}
        </SectionTitle>
        {props.body ? <p className={inverted ? undefined : "text-muted-foreground"}>{props.body}</p> : null}
        <address className="flex flex-col not-italic">
          {props.address.map((line, i) => (
            <span key={i} className={i === 0 ? "font-semibold" : undefined}>
              {line}
            </span>
          ))}
        </address>
        {props.contact.length ? (
          <ul className="flex flex-col gap-1">
            {props.contact.map((link, i) => (
              <li key={i}>
                <TextLink link={link} ctx={ctx} className="underline" />
              </li>
            ))}
          </ul>
        ) : null}
        <Actions primary={props.primaryCta} secondary={props.secondaryCta} ctx={ctx} onAccent={inverted} />
      </div>
    );
    if (variant === "stacked") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
          <div className="flex flex-col gap-8">
            {copy}
            {map}
          </div>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
          {copy}
          {map}
        </div>
      </SectionBand>
    );
  },
});
