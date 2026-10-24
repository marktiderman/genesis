import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, Image as ImageIcon } from "lucide-react";
import { cn, Skeleton } from "@marktiderman/genesis-ui";
import type { PhotoRef } from "@marktiderman/genesis-forms";

/** Types most browsers can't draw (HEIC and HEIF): shown as a file tile with an Open link. */
const UNDRAWABLE = new Set(["image/heic", "image/heif"]);

type Resolved = { state: "loading" } | { state: "ready"; url: string } | { state: "missing" };

function Photo({ photo, resolveUrl }: { photo: PhotoRef; resolveUrl: (ref: PhotoRef) => Promise<string | null> }) {
  const [resolved, setResolved] = useState<Resolved>({ state: "loading" });
  const [broken, setBroken] = useState(false);

  // Each photo's address is asked for once (per photo id); a signed link may expire, so
  // it isn't kept beyond this view.
  useEffect(() => {
    let live = true;
    setResolved({ state: "loading" });
    setBroken(false);
    resolveUrl(photo)
      .then((url) => live && setResolved(url ? { state: "ready", url } : { state: "missing" }))
      .catch(() => live && setResolved({ state: "missing" }));
    return () => {
      live = false;
    };
  }, [photo.id]); // eslint-disable-line react-hooks/exhaustive-deps -- resolveUrl is often an inline function

  const tile = "relative size-28 overflow-hidden rounded-md border border-border bg-muted";
  if (resolved.state === "loading") return <Skeleton className="size-28 rounded-md" aria-label={`Loading ${photo.name}`} />;
  if (resolved.state === "missing") {
    return (
      <div className={cn(tile, "flex flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground")}>
        <ImageOff className="size-5" aria-hidden="true" />
        <span>Photo unavailable</span>
      </div>
    );
  }
  if (broken || UNDRAWABLE.has(photo.type.toLowerCase())) {
    return (
      <div className={cn(tile, "flex flex-col items-center justify-center gap-1 p-2 text-center text-xs")}>
        <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="line-clamp-2 break-all text-muted-foreground">{photo.name}</span>
        <a
          href={resolved.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          Open <ExternalLink className="size-3" aria-hidden="true" />
          <span className="sr-only">{photo.name}</span>
        </a>
      </div>
    );
  }
  return (
    <a
      href={resolved.url}
      target="_blank"
      rel="noreferrer"
      className={cn(tile, "block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
      title={photo.name}
    >
      <img src={resolved.url} alt={photo.name} loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
    </a>
  );
}

/**
 * A response's photos as thumbnails, each opening full size in a new tab. Data-agnostic:
 * the host resolves each reference to an address it may show (a short-lived signed link,
 * say), or null when it can't. A photo most browsers can't draw (HEIC) is a tile with
 * its name and an Open link; one that can't be found says so.
 */
export function PhotoAnswer({
  photos,
  resolveUrl,
  className,
  testID,
}: {
  photos: PhotoRef[];
  resolveUrl: (ref: PhotoRef) => Promise<string | null>;
  className?: string | undefined;
  testID?: string | undefined;
}) {
  if (!photos.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-3", className)} aria-label="Photos" data-testid={testID}>
      {photos.map((photo) => (
        <li key={photo.id}>
          <Photo photo={photo} resolveUrl={resolveUrl} />
        </li>
      ))}
    </ul>
  );
}
