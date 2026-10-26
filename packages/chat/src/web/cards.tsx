/**
 * @feat:chat
 * Two cards under a message: `ChatLinkPreview`, a link's title, description, site and image
 * (all plain text from Open Graph, never HTML), and
 * `ChatAttachmentCard`, the generic card apps use for their own attachment kinds (a form, a
 * check-in): a title, a subtitle and one action.
 */
import { useState, type ComponentType } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { Button, cn } from "@marktiderman/genesis-ui";
import { isHttpsUrl } from "../core/extras";
import type { ChatLinkPreview as LinkPreviewData } from "../core/types";
import { isSafeHref } from "./markdown";

/**
 * Whether a link preview shows its image. The image lives on the linked site, so loading it
 * straight from there tells that site each reader's IP address and when they read the message
 * (a tracking pixel the sender controls). So:
 * - `"off"` (the default): no image;
 * - `"proxy"`: through your own image proxy, `proxyUrl(imageUrl)`; no image without it;
 * - `"direct"`: from the linked site (only if you accept that).
 */
export type LinkPreviewImages = "off" | "proxy" | "direct";

/** The image a preview may show under this setting, or null. Only https image URLs are ever considered. */
export function linkPreviewImageSrc(imageUrl: string | null | undefined, images: LinkPreviewImages = "off", proxyUrl?: (url: string) => string | null | undefined): string | null {
  if (!isHttpsUrl(imageUrl)) return null;
  if (images === "direct") return imageUrl;
  if (images !== "proxy" || !proxyUrl) return null;
  try {
    return proxyUrl(imageUrl) || null;
  } catch {
    return null;
  }
}

export interface ChatLinkPreviewProps {
  preview: LinkPreviewData;
  /** Whether to show its image, and how; `"off"` by default (see LinkPreviewImages). */
  images?: LinkPreviewImages;
  /** Your image proxy, for `images: "proxy"`: the URL to load instead of the linked site's. */
  proxyUrl?: (url: string) => string | null | undefined;
  tone?: "default" | "primary";
  className?: string;
}

export function ChatLinkPreview({ preview, images = "off", proxyUrl, tone = "default", className }: ChatLinkPreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  if (preview.status !== "ok" || !isSafeHref(preview.url) || !isHttpsUrl(preview.url)) return null;
  let host = preview.url;
  try {
    host = new URL(preview.url).hostname.replace(/^www\./, "");
  } catch {
    // shown as written
  }
  const image = imageFailed ? null : linkPreviewImageSrc(preview.imageUrl, images, proxyUrl);
  const title = preview.title?.trim() || host;
  const primary = tone === "primary";
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      referrerPolicy="no-referrer"
      className={cn(
        "mt-1.5 flex w-[min(20rem,100%)] flex-col overflow-hidden rounded-lg border-l-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary bg-background hover:bg-accent",
        className,
      )}
      aria-label={`${title}, ${preview.siteName ?? host}. Open link`}
      data-testid="genesis-chat-link-preview"
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="aspect-[1.91/1] w-full bg-muted object-cover"
          data-testid="genesis-chat-link-preview-image"
        />
      ) : null}
      <span className="flex flex-col gap-0.5 px-2.5 py-2">
        <span className={cn("truncate text-[11px] uppercase tracking-wide", primary ? "text-primary-foreground/75" : "text-muted-foreground")}>{preview.siteName ?? host}</span>
        <span className="line-clamp-2 text-sm font-semibold leading-snug">{title}</span>
        {preview.description ? <span className={cn("line-clamp-2 text-xs", primary ? "text-primary-foreground/85" : "text-muted-foreground")}>{preview.description}</span> : null}
      </span>
    </a>
  );
}

export interface ChatAttachmentCardProps {
  title: string;
  subtitle?: string | null;
  /** An icon component (lucide); a clipboard by default. */
  icon?: ComponentType<{ className?: string }>;
  /** One button: a link (`href`, safe schemes only) or a handler. */
  action?: { label: string; href?: string; onPress?: () => void } | null;
  tone?: "default" | "primary";
  className?: string;
}

/** A card for an app's own attachment kind: an icon, a title, a subtitle and one action. */
export function ChatAttachmentCard({ title, subtitle, icon: Icon = ClipboardList, action, tone = "default", className }: ChatAttachmentCardProps) {
  const primary = tone === "primary";
  const href = action?.href && isSafeHref(action.href) ? action.href : null;
  return (
    <div
      className={cn("flex w-[min(20rem,100%)] items-center gap-3 rounded-lg p-2.5", primary ? "bg-primary-foreground/15" : "border bg-background", className)}
      data-testid="genesis-chat-attachment-card"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", primary ? "bg-primary-foreground/20" : "bg-primary/10 text-primary")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle ? <span className={cn("block truncate text-xs", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{subtitle}</span> : null}
      </span>
      {action && (href || action.onPress) ? (
        href ? (
          <Button asChild size="sm" variant={primary ? "secondary" : "default"} className="shrink-0">
            <a href={href} target={/^https?:/i.test(href) ? "_blank" : undefined} rel="noopener noreferrer">
              {action.label}
              {/^https?:/i.test(href) ? <ExternalLink aria-hidden /> : null}
            </a>
          </Button>
        ) : (
          <Button type="button" size="sm" variant={primary ? "secondary" : "default"} className="shrink-0" onClick={action.onPress}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
