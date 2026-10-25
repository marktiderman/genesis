import { z } from "zod";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Surface } from "../core/schemas";
import { Anchor, HiddenTitle, SectionBand, SectionIntro, SiteImage, onAccent } from "./shared";

const schema = z.object({
  heading: Line(90).optional(),
  body: Copy(320).optional(),
  images: z.array(Image.extend({ caption: Line(140).optional() })).min(1).max(24),
  surface: Surface.default("base"),
  anchor: Anchor,
});

export const gallerySection = defineSection({
  type: "gallery",
  version: 1,
  label: "Gallery",
  description: "Photos in an even grid or a masonry layout, each with alt text.",
  category: "content",
  schema,
  variants: [
    { id: "grid", label: "Even grid" },
    { id: "masonry", label: "Masonry" },
  ],
  defaultVariant: "grid",
  presets: [
    {
      name: "Photo grid",
      variant: "grid",
      props: { heading: "Inside", images: [{ src: "/photo-1.jpg", alt: "Describe the photo" }, { src: "/photo-2.jpg", alt: "Describe the photo" }, { src: "/photo-3.jpg", alt: "Describe the photo" }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} body={props.body} tone={onAccent(props.surface) ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>Gallery</HiddenTitle>;
    const masonry = variant === "masonry";
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <ul className={masonry ? "mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4 [&>li]:break-inside-avoid" : "mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
          {props.images.map((image, i) => (
            <li key={i}>
              <figure className="flex flex-col gap-2">
                <SiteImage
                  image={image}
                  ctx={ctx}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className={masonry ? "w-full rounded-lg" : "aspect-square w-full rounded-lg object-cover"}
                />
                {image.caption ? <figcaption className="text-sm">{image.caption}</figcaption> : null}
              </figure>
            </li>
          ))}
        </ul>
      </SectionBand>
    );
  },
});
