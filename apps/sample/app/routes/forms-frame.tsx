import { useEffect, useMemo, useState } from "react";
import { parseForm, replay, type FormEvent } from "@marktiderman/genesis-forms";
import { ErrorBoundary } from "@marktiderman/genesis-forms-devtools";
import { Form } from "@marktiderman/genesis-forms-web";
import { isShellMessage, type FrameToShell, type ShellToFrame } from "../lib/forms-frame-protocol";

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
      if (isShellMessage(e.data) && parseForm(e.data.definition).ok) setLoad(e.data);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "gf:ready" } satisfies FrameToShell, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const engine = useMemo(() => {
    if (!load) return null;
    try {
      return replay(load.definition, load.events, { hidden: load.context });
    } catch {
      return null;
    }
  }, [load]);

  useEffect(() => {
    if (!engine) return;
    // The engine notifies on every state change; only clone the log across when it changed.
    let last: FormEvent[] | null = null;
    const post = () => {
      const events = engine.getState().events;
      if (events === last) return;
      last = events;
      window.parent.postMessage({ type: "gf:events", events } satisfies FrameToShell, window.location.origin);
    };
    post();
    return engine.subscribe(post);
  }, [engine]);

  if (load && !engine) return <p className="p-6 text-destructive">This form could not be loaded.</p>;
  if (!load || !engine) return <p className="p-6 text-muted-foreground">Waiting for the playground…</p>;
  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <ErrorBoundary resetKey={load} label="The form">
        <Form form={load.definition} engine={engine} layout={load.layout} />
      </ErrorBoundary>
    </main>
  );
}
