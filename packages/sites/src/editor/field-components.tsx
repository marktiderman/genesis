/**
 * The editor's own field controls (Puck custom fields), on Genesis UI: the
 * image picker with alt text, rich text, one-per-line lists, and the
 * honest "can't be edited here".
 */
import * as React from "react";
import type { CustomField } from "@puckeditor/core";
import { Button } from "@marktiderman/genesis-ui/button";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { RichTextEditor } from "@marktiderman/genesis-ui/rich-text-editor";
import type { RichTextDoc } from "@marktiderman/genesis-ui/rich-text";
import { isSafeImageSrc } from "../core/urls";
import { useEditorServices, type PickedImage } from "./services";

interface FieldRenderProps<V> {
  field: CustomField<V>;
  name: string;
  id: string;
  value: V;
  onChange: (value: V) => void;
  readOnly?: boolean;
}

interface ImageValue {
  src?: string;
  alt?: string;
  decorative?: boolean;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

function Thumb({ src, alt }: { src?: string | undefined; alt: string }) {
  if (!src) return <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">No image</div>;
  if (!isSafeImageSrc(src)) return <div className="rounded-md border border-destructive p-2 text-sm text-destructive">This address can't be used for an image: use a site path or an https link.</div>;
  return <img src={src} alt={alt} className="h-24 w-full rounded-md border border-border object-cover" />;
}

/** An image object: the picker, alt text (required unless decorative), and remove. */
export function ImageField({ field, id, value, onChange, readOnly }: FieldRenderProps<ImageValue | undefined>) {
  const services = useEditorServices();
  const image = value ?? {};
  const missingAlt = Boolean(image.src) && !image.alt?.trim() && image.decorative !== true;
  const choose = async () => {
    const picked = await services.pickImage(image.src ? { current: image as PickedImage } : {});
    if (!picked) return;
    // The new image replaces every image attribute (alt, decorative, size, focal point); other props stay.
    const { src: _s, alt: _a, decorative: _d, width: _w, height: _h, focal: _f, ...rest } = image;
    onChange({ ...rest, ...picked });
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-medium">
        {field.label}
      </span>
      <Thumb src={image.src} alt={image.alt ?? ""} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={choose} disabled={readOnly}>
          {image.src ? "Replace image" : "Choose image"}
        </Button>
        {image.src ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)} disabled={readOnly}>
            Remove
          </Button>
        ) : null}
      </div>
      {image.src ? (
        <>
          <Label htmlFor={`${id}-alt`}>Alt text</Label>
          <Textarea
            id={`${id}-alt`}
            value={image.alt ?? ""}
            rows={2}
            maxLength={300}
            disabled={readOnly || image.decorative === true}
            aria-invalid={missingAlt || undefined}
            aria-describedby={`${id}-alt-hint`}
            onChange={(e) => onChange({ ...image, alt: e.currentTarget.value })}
          />
          <p id={`${id}-alt-hint`} className={missingAlt ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {missingAlt ? "Describe the image, or mark it decorative. A page can't be published without this." : "What someone who can't see the image needs to know."}
          </p>
          <div className="flex items-center gap-2">
            <Switch id={`${id}-decorative`} checked={image.decorative === true} disabled={readOnly} onCheckedChange={(on) => onChange({ ...image, decorative: on || undefined, ...(on ? { alt: "" } : {}) })} />
            <Label htmlFor={`${id}-decorative`}>Decorative (adds nothing a reader needs)</Label>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The `src` of a list item that is itself an image (a gallery photo). Its alt text is the item's next field. */
export function ImageSrcField({ field, id, value, onChange, readOnly }: FieldRenderProps<string | undefined>) {
  const services = useEditorServices();
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-medium">
        {field.label}
      </span>
      <Thumb src={value} alt="" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={readOnly}
        onClick={async () => {
          const picked = await services.pickImage({ altElsewhere: true, ...(value ? { current: { src: value, alt: "" } } : {}) });
          if (picked) onChange(picked.src);
        }}
      >
        {value ? "Replace image" : "Choose image"}
      </Button>
    </div>
  );
}

/** Rich text: the Genesis editor, with h2 and h3 only (the page has its h1). */
export function RichTextField({ field, id, value, onChange, readOnly }: FieldRenderProps<RichTextDoc | undefined>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      <RichTextEditor id={id} value={value ?? { type: "doc", content: [] }} onChange={(doc) => onChange(doc)} readOnly={readOnly} headingLevels={[2, 3]} contentClassName="min-h-40" />
    </div>
  );
}

/** A list of short strings, one per line. */
export function LinesField({ field, id, value, onChange, readOnly }: FieldRenderProps<string[] | undefined>) {
  const max = (field.metadata as { maxItems?: number } | undefined)?.maxItems;
  const [text, setText] = React.useState(() => (value ?? []).join("\n"));
  const lastSent = React.useRef(value);
  // Puck may hand the list back as a copy: compare by content, or a just-typed newline would vanish.
  React.useEffect(() => {
    if (JSON.stringify(value ?? []) !== JSON.stringify(lastSent.current ?? [])) setText((value ?? []).join("\n"));
  }, [value]);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Textarea
        id={id}
        value={text}
        rows={4}
        disabled={readOnly}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          const lines = next.split("\n").map((l) => l.trim()).filter(Boolean);
          lastSent.current = lines;
          onChange(lines);
        }}
      />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        One per line{max ? `, up to ${max}` : ""}.
      </p>
    </div>
  );
}

/** A prop the editor has no field for: said plainly, never dropped. */
export function UnsupportedField({ field }: FieldRenderProps<unknown>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{field.label}</span>
      <p className="text-sm text-muted-foreground">This can't be edited here yet; it's kept as it is.</p>
    </div>
  );
}
