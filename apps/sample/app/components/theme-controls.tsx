/**
 * <ThemeControls /> — web theme switcher (Phase G.13).
 *
 * Three controls used across every showcase route:
 *   1. Light / Dark / System mode toggle.
 *   2. Reduce-motion toggle.
 *   3. Brand selector (today: only "genesis"; the contract is here for
 *      future multi-brand storybook entries).
 *
 * Persists state in localStorage so reloads stay deterministic.
 *
 * @stability stable
 */
import { useEffect, useState } from "react";
import { Card, CardContent, Button, Switch, Label } from "@marktiderman/genesis-ui";

type Mode = "light" | "dark" | "system";

const KEY_MODE = "genesis-showcase-mode";
const KEY_REDUCE = "genesis-showcase-reduce-motion";

function applyMode(m: Mode) {
  const root = document.documentElement;
  const resolved =
    m === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : m;
  root.classList.toggle("dark", resolved === "dark");
}

function applyReduceMotion(reduce: boolean) {
  const root = document.documentElement;
  root.dataset["reduceMotion"] = reduce ? "true" : "false";
}

export function ThemeControls() {
  const [mode, setMode] = useState<Mode>("system");
  const [reduce, setReduce] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedMode = (localStorage.getItem(KEY_MODE) as Mode | null) ?? "system";
    const storedReduce = localStorage.getItem(KEY_REDUCE) === "1";
    setMode(storedMode);
    setReduce(storedReduce);
    applyMode(storedMode);
    applyReduceMotion(storedReduce);
    setHydrated(true);
  }, []);

  const onModeChange = (m: Mode) => {
    setMode(m);
    localStorage.setItem(KEY_MODE, m);
    applyMode(m);
  };

  const onReduceChange = (v: boolean) => {
    setReduce(v);
    localStorage.setItem(KEY_REDUCE, v ? "1" : "0");
    applyReduceMotion(v);
  };

  if (!hydrated) {
    // Prevent SSR/CSR mismatch — render skeleton-ish empty card on server.
    return (
      <Card>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading theme controls…</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Color mode
          </span>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => onModeChange(m)}
                className="flex-1"
                data-testid={`theme-mode-${m}`}
              >
                {m[0].toUpperCase() + m.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="reduce-motion-toggle">Reduce motion</Label>
            <span className="text-xs text-muted-foreground">
              Skip non-essential transitions and parallax.
            </span>
          </div>
          <Switch
            id="reduce-motion-toggle"
            checked={reduce}
            onCheckedChange={onReduceChange}
            data-testid="theme-reduce-motion"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Brand
          </span>
          <span className="text-sm">
            genesis &middot; only built-in brand today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
