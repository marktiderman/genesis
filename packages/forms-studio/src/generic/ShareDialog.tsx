import { useId, useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@marktiderman/genesis-ui";
import { Copy, ExternalLink, Printer } from "lucide-react";
import { embedSnippet, prefilledUrl, type PrefillChoice } from "./share";



const ANY = "__any";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Couldn't copy. Select it and copy it instead.");
  }
}

function CopyField({
  id,
  label,
  value,
  what,
}: {
  id: string;
  label: string;
  value: string;
  what: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} onFocus={(e) => e.target.select()} />
        <Button
          variant="outline"
          startIcon={<Copy className="size-4" />}
          onClick={() => void copy(value, what)}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

/**
 * Sharing one published page (a form, a course), as Google Forms' Send step: its link with Copy, a QR code
 * (and a printable poster when the host has one), an `<iframe>` to embed it on a website,
 * and a builder for prefilled links (`?class=…&coach=…`, or whatever the host offers).
 * Generic: the host passes the link, how to draw a QR code, and the prefill choices.
 * Moved up from Breakthrough's src/components/forms/ShareDialog.tsx.
 */
export function ShareDialog({
  open,
  onOpenChange,
  noun = "form",
  title = `Share your ${noun}`,
  description = "Anyone with the link can answer.",
  url,
  posterUrl,
  renderQr,
  name,
  prefill = [],
  prefillNote,
  defaultTab = "link",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string | undefined;
  description?: ReactNode;
  /** The public link; null while it is still loading. */
  url: string | null;
  /** A printable poster for a link (the base link, or a prefilled one), when the host has one. */
  posterUrl?: ((url: string, prefill: Record<string, string>) => string | null) | undefined;
  /** Draws a QR code for a link. */
  renderQr?: ((url: string) => ReactNode) | undefined;
  /** Its name, for the embed's accessible title. */
  name: string;
  /** What it is, in the default title and buttons: "form" (default), "course". */
  noun?: string | undefined;
  /** The search params a prefilled link may set, each with its choices. None hides the builder. */
  prefill?: readonly PrefillChoice[] | undefined;
  /** Said under the prefilled-link builder (what a prefilled link does). */
  prefillNote?: ReactNode;
  /** The tab it opens on (each time it opens). Default "link". */
  defaultTab?: "link" | "qr" | "embed" | undefined;
}) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const chosen = Object.fromEntries(Object.entries(values).filter(([, v]) => v && v !== ANY));
  const prefilled = url && Object.keys(chosen).length ? prefilledUrl(url, chosen) : null;
  const poster = url ? posterUrl?.(url, {}) : null;
  const prefilledPoster = prefilled && url ? posterUrl?.(url, chosen) : null;
  const usable = prefill.filter((p) => p.options.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {!url ? (
          <p className="text-sm text-muted-foreground">Loading the link…</p>
        ) : (
          <Tabs defaultValue={defaultTab === "qr" && !renderQr ? "link" : defaultTab}>
            <TabsList>
              <TabsTrigger value="link">Link</TabsTrigger>
              {renderQr && <TabsTrigger value="qr">QR code</TabsTrigger>}
              <TabsTrigger value="embed">Embed</TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="space-y-5 pt-2">
              <CopyField id={`${id}-link`} label="Link" value={url} what="Link" />
              <Button
                asChild
                variant="ghost"
                size="sm"
                startIcon={<ExternalLink className="size-4" />}
              >
                <a href={url} target="_blank" rel="noreferrer">
                  Open the {noun}
                </a>
              </Button>
              {usable.length > 0 && (
                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium">Prefilled link</p>
                    {prefillNote && <p className="text-sm text-muted-foreground">{prefillNote}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {usable.map((p) => (
                      <Select
                        key={p.key}
                        value={values[p.key] ?? ANY}
                        onValueChange={(v) => setValues((old) => ({ ...old, [p.key]: v }))}
                      >
                        <SelectTrigger className="min-w-40 flex-1" aria-label={p.label}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>{p.anyLabel}</SelectItem>
                          {p.options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                  </div>
                  {prefilled && (
                    <>
                      <CopyField
                        id={`${id}-prefilled`}
                        label="Prefilled link"
                        value={prefilled}
                        what="Prefilled link"
                      />
                      {prefilledPoster && (
                        <Button
                          asChild
                          variant="outline"
                          startIcon={<Printer className="size-4" />}
                        >
                          <a href={prefilledPoster} target="_blank" rel="noreferrer">
                            Print a poster for this link
                          </a>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>
            {renderQr && (
              <TabsContent value="qr" className="space-y-4 pt-2">
                <div className="mx-auto w-full max-w-56">{renderQr(url)}</div>
                <p className="text-center text-sm text-muted-foreground">
                  Scan with a phone's camera to open the {noun}.
                </p>
                {poster && (
                  <div className="flex justify-center">
                    <Button asChild variant="outline" startIcon={<Printer className="size-4" />}>
                      <a href={poster} target="_blank" rel="noreferrer">
                        Print a QR poster
                      </a>
                    </Button>
                  </div>
                )}
              </TabsContent>
            )}
            <TabsContent value="embed" className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-embed`}>Embed on your website</Label>
                <Textarea
                  id={`${id}-embed`}
                  readOnly
                  rows={4}
                  className="font-mono text-xs"
                  value={embedSnippet(url, name)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <Button
                variant="outline"
                startIcon={<Copy className="size-4" />}
                onClick={() => void copy(embedSnippet(url, name), "Embed code")}
              >
                Copy embed code
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
