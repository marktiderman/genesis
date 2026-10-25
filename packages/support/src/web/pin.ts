/**
 * Pins on the live page: the person points at the spot a report is about
 * (`pickPin`), and numbered pins show their open reports on the page they
 * were sent from (`createPinOverlay`). A pin travels in the report's
 * context as `pin`, so it needs no column of its own.
 *
 * Plain DOM on the host document (no iframe, no framework), colored from the
 * Genesis theme variables.
 */

export interface FeedbackPin {
  /** A CSS selector for the element under the point, when one is stable (an id or a data-testid). */
  locator?: string | null;
  /** Where in that element, in percent. */
  xPct?: number | null;
  yPct?: number | null;
  /** The point in the viewport, as a fallback. */
  viewportX: number;
  viewportY: number;
  scrollX: number;
  scrollY: number;
}

export interface PinnedReport {
  id: string;
  title: string;
  /** The route (path) it was sent from. */
  route: string | null;
  pin: FeedbackPin;
}

const cssEscape = (value: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^A-Za-z0-9_-]/g, "\\$&"));

/** A selector for an element that is likely to survive a re-render: its id, else a data-testid. */
export function stableLocator(el: Element | null): string | null {
  for (let node: Element | null = el; node && node !== node.ownerDocument.documentElement; node = node.parentElement) {
    if (node.id) return `#${cssEscape(node.id)}`;
    const testId = node.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
  }
  return null;
}

/**
 * Waits for one click anywhere on the page and returns the pin, or `null`
 * on Escape. The click doesn't reach the page.
 */
export function pickPin(doc: Document = document): Promise<FeedbackPin | null> {
  return new Promise((resolve) => {
    const veil = doc.createElement("div");
    veil.setAttribute("data-genesis-support-pin-picker", "");
    veil.setAttribute("role", "presentation");
    Object.assign(veil.style, { position: "fixed", inset: "0", zIndex: "2147483000", cursor: "crosshair", background: "hsl(var(--foreground) / 0.06)" });
    const done = (pin: FeedbackPin | null) => {
      veil.remove();
      doc.removeEventListener("keydown", onKey, true);
      resolve(pin);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") done(null);
    };
    veil.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      veil.style.pointerEvents = "none";
      const target = doc.elementFromPoint?.(event.clientX, event.clientY) ?? null;
      const locator = stableLocator(target);
      const anchor = locator ? doc.querySelector(locator) : null;
      const rect = anchor?.getBoundingClientRect();
      const view = doc.defaultView;
      done({
        locator,
        xPct: rect && rect.width ? Math.round(((event.clientX - rect.left) / rect.width) * 100) : null,
        yPct: rect && rect.height ? Math.round(((event.clientY - rect.top) / rect.height) * 100) : null,
        viewportX: event.clientX,
        viewportY: event.clientY,
        scrollX: view?.scrollX ?? 0,
        scrollY: view?.scrollY ?? 0,
      });
    });
    doc.addEventListener("keydown", onKey, true);
    doc.body.appendChild(veil);
  });
}

/** Where a pin sits now: on its element if it is still there, else where it was clicked. */
export function resolvePin(doc: Document, pin: FeedbackPin): { left: number; top: number } {
  if (pin.locator) {
    try {
      const node = doc.querySelector(pin.locator);
      if (node) {
        const r = node.getBoundingClientRect();
        return { left: r.left + (r.width * (pin.xPct ?? 50)) / 100, top: r.top + (r.height * (pin.yPct ?? 50)) / 100 };
      }
    } catch {
      // an invalid selector: fall back to the point
    }
  }
  return { left: pin.viewportX, top: pin.viewportY };
}

export interface PinOverlay {
  setReports(reports: PinnedReport[]): void;
  destroy(): void;
}

/** Numbered pins for reports sent from the current path. Re-drawn on navigation, scroll and resize. */
export function createPinOverlay(options: { reports: PinnedReport[]; onPinClick?: (report: PinnedReport) => void; document?: Document }): PinOverlay {
  const doc = options.document ?? document;
  const view = doc.defaultView;
  const host = doc.createElement("div");
  host.setAttribute("data-genesis-support-pins", "");
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "Feedback pins");
  Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147482999", pointerEvents: "none" });
  doc.body.appendChild(host);
  let reports = options.reports.slice();

  const render = () => {
    host.replaceChildren();
    const path = view?.location.pathname ?? "";
    reports
      .filter((r) => !r.route || r.route === path)
      .forEach((report, i) => {
        const { left, top } = resolvePin(doc, report.pin);
        const pin = doc.createElement("button");
        pin.type = "button";
        pin.textContent = String(i + 1);
        pin.setAttribute("aria-label", `Feedback ${i + 1}: ${report.title}`);
        pin.title = report.title;
        Object.assign(pin.style, {
          position: "fixed",
          left: `${Math.max(12, left)}px`,
          top: `${Math.max(12, top)}px`,
          transform: "translate(-50%, -50%)",
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          border: "2px solid hsl(var(--background))",
          background: "hsl(var(--destructive))",
          color: "hsl(var(--destructive-foreground))",
          font: "600 12px system-ui, sans-serif",
          pointerEvents: "auto",
          cursor: "pointer",
        });
        pin.addEventListener("click", (event) => {
          event.stopPropagation();
          options.onPinClick?.(report);
        });
        host.appendChild(pin);
      });
  };

  view?.addEventListener("popstate", render);
  view?.addEventListener("resize", render);
  view?.addEventListener("scroll", render, { passive: true });
  render();
  return {
    setReports(next) {
      reports = next.slice();
      render();
    },
    destroy() {
      view?.removeEventListener("popstate", render);
      view?.removeEventListener("resize", render);
      view?.removeEventListener("scroll", render);
      host.remove();
    },
  };
}
