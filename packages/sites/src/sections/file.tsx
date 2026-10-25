/**
 * Files to download: a timetable, a waiver, a price list, each a PDF (or an
 * image) uploaded under `sites/<site_id>/files/` or an https URL. Each link
 * says what it is and how big ("PDF, 1.2 MB") before anyone clicks it.
 */
import { z } from "zod";
import { Download, FileText } from "lucide-react";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection, type RenderContext } from "../core/registry";
import { Copy, FileRef, Line, Surface } from "../core/schemas";
import { Anchor, ItemTitle, SectionBand, SectionIntro, fileDescription, fileHref, onAccent } from "./shared";

const Item = z.object({
  label: Line(120),
  description: Copy(300).optional(),
  file: FileRef,
});
type Item = z.infer<typeof Item>;

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  files: z.array(Item).min(1).max(24),
  surface: Surface.default("base"),
  anchor: Anchor,
});

function DownloadLink({ item, ctx, className }: { item: Item; ctx: RenderContext; className?: string }) {
  const href = fileHref(item.file, ctx);
  if (!href) return <span className={className}>{item.label}</span>;
  const sitePath = item.file.src.startsWith("/");
  return (
    <a
      href={href}
      type={item.file.mime}
      {...(sitePath ? { download: "" } : { rel: "noopener" })}
      data-gs-event="download"
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    >
      <Download aria-hidden="true" className="size-4 shrink-0" />
      <span>
        {item.label} <span className="whitespace-nowrap text-sm font-normal">({fileDescription(item.file)})</span>
      </span>
    </a>
  );
}

export const fileSection = defineSection({
  type: "file",
  version: 1,
  label: "Downloads",
  description: "Files to download (PDFs), each with what it is and how big.",
  category: "content",
  schema,
  variants: [
    { id: "list", label: "List" },
    { id: "cards", label: "Cards" },
  ],
  defaultVariant: "list",
  presets: [
    { name: "Downloads", variant: "list", props: { heading: "Downloads", files: [{ label: "Timetable", file: { src: "/files/timetable.pdf", mime: "application/pdf" } }] } },
    { name: "File cards", variant: "cards", props: { heading: "Forms to bring", files: [{ label: "Waiver", description: "Sign it before your first class.", file: { src: "/files/waiver.pdf", mime: "application/pdf" } }] } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    if (variant === "cards") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {props.files.map((item, i) => (
              <li key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 text-foreground">
                <FileText aria-hidden="true" className="size-8" />
                <ItemTitle ctx={ctx}>{item.label}</ItemTitle>
                {item.description ? <p className="text-muted-foreground">{item.description}</p> : null}
                <DownloadLink item={{ ...item, label: `Download ${item.label}` }} ctx={ctx} className="mt-auto" />
              </li>
            ))}
          </ul>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
        {intro}
        <ul className="mx-auto mt-8 flex max-w-3xl flex-col divide-y divide-border">
          {props.files.map((item, i) => (
            <li key={i} className="flex flex-col gap-1 py-4">
              <DownloadLink item={item} ctx={ctx} />
              {item.description ? <p className={inverted ? undefined : "text-muted-foreground"}>{item.description}</p> : null}
            </li>
          ))}
        </ul>
      </SectionBand>
    );
  },
});
