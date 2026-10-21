import { useEffect, useMemo, useState } from "react";
import { replay } from "@marktiderman/genesis-forms";
import { Form } from "@marktiderman/genesis-forms-web";
import type { FrameToShell, ShellToFrame } from "../lib/forms-frame-protocol";

/**
 * The form alone, inside the playground's device frame. Rendering in an
 * iframe makes Tailwind breakpoints, `dir` and theme respond to the frame's
 * own viewport. The shell sends the definition; the frame reports events.
 */
export default function FormsFrame() {
  const [load, setLoad] = useState<ShellToFrame | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if ((e.data as ShellToFrame)?.type === "gf:load") setLoad(e.data as ShellToFrame);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "gf:ready" } satisfies FrameToShell, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const engine = useMemo(
    () => (load ? replay(load.definition, load.events, { hidden: load.context }) : null),
    [load],
  );

  useEffect(() => {
    if (!engine) return;
    const post = () =>
      window.parent.postMessage(
        { type: "gf:events", events: engine.getState().events } satisfies FrameToShell,
        window.location.origin,
      );
    post();
    return engine.subscribe(post);
  }, [engine]);

  if (!load || !engine) return <p className="p-6 text-muted-foreground">Waiting for the playground…</p>;
  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <Form form={load.definition} engine={engine} layout={load.layout} />
    </main>
  );
}
