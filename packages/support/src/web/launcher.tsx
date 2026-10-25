/**
 * The feedback launcher: a floating button that opens `FeedbackPanel` in a
 * Genesis UI Sheet, and `mountSupportWidget`, the loader that puts it on any
 * page with one call (for a page that isn't a React app of its own).
 */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@marktiderman/genesis-ui";
import { resolveSupportCopy } from "../copy";
import { FeedbackPanel, type FeedbackPanelProps } from "./feedback-panel";

export type LauncherPosition = "bottom-right" | "bottom-left";

export interface FeedbackLauncherProps extends FeedbackPanelProps {
  position?: LauncherPosition;
  /** The button's text. Default the copy's "Send feedback". */
  label?: string;
}

const POSITIONS: Record<LauncherPosition, string> = {
  "bottom-right": "fixed bottom-4 right-4 z-50",
  "bottom-left": "fixed bottom-4 left-4 z-50",
};

export function FeedbackLauncher({ position = "bottom-right", label, ...panel }: FeedbackLauncherProps) {
  const copy = useMemo(() => resolveSupportCopy(panel.copy), [panel.copy]);
  const [open, setOpen] = useState(false);
  // While the person picks a pin or the browser asks to capture, the sheet steps aside.
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <Button className={POSITIONS[position]} onClick={() => setOpen(true)} data-testid="genesis-support-launcher" aria-haspopup="dialog">
        {label ?? copy.settings.sendFeedback}
      </Button>
      <Sheet open={open && !hidden} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{copy.feedback.title}</SheetTitle>
            <SheetDescription>{copy.feedback.messagePlaceholder}</SheetDescription>
          </SheetHeader>
          <FeedbackPanel {...panel} onHide={setHidden} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Mount the launcher into the page: into `container`, or a new element at the
 * end of `<body>`. Returns the unmount. The page needs Genesis UI's styles.
 */
export function mountSupportWidget(props: FeedbackLauncherProps & { container?: HTMLElement }): () => void {
  const { container, ...launcher } = props;
  const host = container ?? document.body.appendChild(document.createElement("div"));
  host.setAttribute("data-genesis-support", "");
  const root = createRoot(host);
  root.render(<FeedbackLauncher {...launcher} />);
  return () => {
    root.unmount();
    if (!container) host.remove();
  };
}
