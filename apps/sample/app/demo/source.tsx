/** "View source": the real files behind a demo screen, in a side sheet. */
import { useState } from "react";
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@marktiderman/genesis-ui";
import { Code } from "lucide-react";

/**
 * A "View source" button and its sheet. Pass `open`/`onOpenChange` (and no
 * trigger) to open it from elsewhere, such as a list's header menu.
 */
export function ViewSource({
  files,
  open: openProp,
  onOpenChange,
}: {
  files: Record<string, string>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const names = Object.keys(files);
  const [open, setOpen] = useState(names[0] ?? "");
  const controlled = openProp !== undefined;
  return (
    <Sheet {...(controlled ? { open: openProp, onOpenChange } : {})}>
      {controlled ? null : (
        <SheetTrigger asChild>
          <Button testID="source-button-1" variant="outline" size="sm">
            <Code className="mr-1.5 h-4 w-4" aria-hidden />
            View source
          </Button>
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Source</SheetTitle>
          <SheetDescription>The files this screen is built from, as they are in the repository.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Files">
          {names.map((n) => (
            <Button testID="source-button-2" key={n} role="tab" aria-selected={n === open} size="sm" variant={n === open ? "default" : "ghost"} onClick={() => setOpen(n)}>
              <span className="font-mono text-xs">{n}</span>
            </Button>
          ))}
        </div>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed" tabIndex={0}>
          <code>{files[open]}</code>
        </pre>
      </SheetContent>
    </Sheet>
  );
}
