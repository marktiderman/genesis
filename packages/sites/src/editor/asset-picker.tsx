/**
 * The image picker: upload (through the store's `putAsset`, or the host's
 * own upload), choose from the site's library, or link an https image.
 * Every choice needs alt text, or to be marked decorative, before it can be
 * used: the publish check would refuse it anyway, so the picker asks first.
 */
import * as React from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { Asset, SiteStore } from "../core/store";
import { isSafeImageSrc } from "../core/urls";
import type { EditorAssets, PickedImage } from "./services";

/** Raster images only: the database refuses SVG (it can carry script). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"] as const;

export interface AssetPickerProps {
  open: boolean;
  siteId: string;
  store: Pick<SiteStore, "putAsset">;
  assets?: EditorAssets | undefined;
  current?: PickedImage | undefined;
  onDone: (image: PickedImage | null) => void;
}

async function dimensions(file: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const out = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return out;
  } catch {
    return {};
  }
}

/** Why an upload can't be used (or null). */
export function uploadProblem(file: { type: string; size: number } | null, maxBytes = 10 * 1024 * 1024): string | null {
  if (!file) return "Choose a file.";
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG, WebP, AVIF or GIF image (SVG isn't allowed).";
  if (file.size > maxBytes) return `That file is over ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

export function AssetPicker({ open, siteId, store, assets, current, onDone }: AssetPickerProps) {
  const canUpload = Boolean(assets?.upload || store.putAsset);
  const [tab, setTab] = React.useState(canUpload ? "upload" : "link");
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState(current?.src ?? "");
  const [chosen, setChosen] = React.useState<Asset | null>(null);
  const [alt, setAlt] = React.useState(current?.alt ?? "");
  const [decorative, setDecorative] = React.useState(current?.decorative === true);
  const [library, setLibrary] = React.useState<Asset[] | null>(null);
  const [uploaded, setUploaded] = React.useState<Asset[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setChosen(null);
    setError(null);
    setUrl(current?.src ?? "");
    setAlt(current?.alt ?? "");
    setDecorative(current?.decorative === true);
    if (assets?.list) {
      assets.list(siteId).then(setLibrary, (err: unknown) => {
        console.error("[genesis-sites/editor] listing assets failed.", err);
        setLibrary([]);
      });
    }
  }, [open, siteId, assets, current]);

  const altOk = decorative || alt.trim().length > 0;
  // Marked invalid once there is an image to describe, not before.
  const altInvalid = !altOk && (Boolean(file) || Boolean(chosen) || (tab === "link" && url.trim().length > 0));
  const all = [...uploaded, ...(library ?? []).filter((a) => !uploaded.some((u) => u.id === a.id))].filter((a) => a.mime.startsWith("image/") && a.mime !== "image/svg+xml");

  async function use() {
    setError(null);
    if (!altOk) return setError("Describe the image, or mark it decorative.");
    const base = { alt: decorative ? "" : alt.trim(), ...(decorative ? { decorative: true } : {}) };
    if (tab === "upload") {
      const problem = uploadProblem(file, assets?.maxBytes);
      if (problem || !file) return setError(problem);
      setBusy(true);
      try {
        const size = await dimensions(file);
        const meta = { alt: base.alt, name: file.name, ...size };
        const asset = assets?.upload ? await assets.upload(siteId, file, meta) : await store.putAsset!(siteId, file, meta);
        setUploaded((u) => [asset, ...u]);
        if (!isSafeImageSrc(asset.url)) throw new Error(`The upload's address (${asset.url}) isn't a site path or https URL.`);
        onDone({ src: asset.url, ...base, ...size });
      } catch (err) {
        setError(`The upload failed: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (tab === "library") {
      if (!chosen) return setError("Choose an image.");
      return onDone({ src: chosen.url, ...base, ...(chosen.width ? { width: chosen.width } : {}), ...(chosen.height ? { height: chosen.height } : {}) });
    }
    const src = url.trim();
    if (!isSafeImageSrc(src)) return setError("Use a site path (/images/photo.jpg) or an https link.");
    onDone({ src, ...base });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onDone(null))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Upload one, pick one the site has, or link one. Every image needs alt text unless it's decorative.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="upload" value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" disabled={!canUpload}>
              Upload
            </TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="flex flex-col gap-2 pt-2">
            <Label htmlFor={`${id}-file`}>Image file</Label>
            <Input id={`${id}-file`} type="file" accept={IMAGE_TYPES.join(",")} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
            {!canUpload ? <p className="text-sm text-muted-foreground">This site's store doesn't take uploads; link an image instead.</p> : null}
          </TabsContent>
          <TabsContent value="library" className="pt-2">
            {all.length === 0 ? (
              <p className="text-sm text-muted-foreground">{library === null && assets?.list ? "Loading…" : "No images yet. Upload one first."}</p>
            ) : (
              <div role="group" aria-label="Site images" className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                {all.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={chosen?.id === a.id}
                    aria-label={a.alt?.trim() || a.path.split("/").pop() || "Image"}
                    onClick={() => {
                      setChosen(a);
                      if (a.alt && !alt) setAlt(a.alt);
                    }}
                    className={cn("overflow-hidden rounded-md border-2 focus-visible:outline-2 focus-visible:outline-ring", chosen?.id === a.id ? "border-primary" : "border-transparent")}
                  >
                    {isSafeImageSrc(a.url) ? <img src={a.url} alt={a.alt ?? ""} className="h-20 w-full object-cover" /> : <span className="p-2 text-xs">{a.path}</span>}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="link" className="flex flex-col gap-2 pt-2">
            <Label htmlFor={`${id}-url`}>Image address</Label>
            <Input id={`${id}-url`} value={url} placeholder="https://… or /images/photo.jpg" onChange={(e) => setUrl(e.currentTarget.value)} />
          </TabsContent>
        </Tabs>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-alt`}>Alt text</Label>
          <Textarea id={`${id}-alt`} rows={2} maxLength={300} value={alt} disabled={decorative} aria-invalid={altInvalid || undefined} aria-describedby={`${id}-alt-hint`} onChange={(e) => setAlt(e.currentTarget.value)} placeholder="Two people stretching on mats by a window" />
          <p id={`${id}-alt-hint`} className={altInvalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {altInvalid ? "Describe the image, or mark it decorative." : "What someone who can't see the image needs to know."}
          </p>
          <div className="flex items-center gap-2">
            <Switch id={`${id}-decorative`} checked={decorative} onCheckedChange={setDecorative} />
            <Label htmlFor={`${id}-decorative`}>Decorative (adds nothing a reader needs)</Label>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button type="button" onClick={use} loading={busy} disabled={!altOk}>
            Use image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
