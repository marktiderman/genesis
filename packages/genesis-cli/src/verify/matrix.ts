/**
 * The conformance matrix: engines × viewports (docs/RESPONSIVE.md rule 10, WCAG 1.4.10).
 *
 * Playwright has no browser zoom. Zooming a 1280×1024 window to 200% or 400% lays the page out
 * in a 640×512 or 320×256 CSS viewport, so zoom is those viewports (device pixel ratio doesn't
 * change layout). Phone and tablet widths, and the zoomed ones, run with touch on.
 */

export type Engine = "chromium" | "webkit" | "firefox";

export const ENGINES: Engine[] = ["chromium", "webkit", "firefox"];

export interface Viewport {
  /** Stable name used in reports and allow entries: `320`, `1280`, `zoom-200`, `zoom-400`. */
  name: string;
  width: number;
  height: number;
  /** Touch on: `hasTouch`, `isMobile`, and the coarse-pointer checks. */
  touch: boolean;
  /** A phone width: rule 9's floating-control count runs. */
  phone: boolean;
}

export const WIDTHS = [320, 375, 768, 1024, 1280, 1440] as const;

const HEIGHTS: Record<number, number> = { 320: 640, 375: 812, 768: 1024, 1024: 768, 1280: 800, 1440: 900 };

export function widthViewport(width: number): Viewport {
  return { name: String(width), width, height: HEIGHTS[width] ?? 900, touch: width <= 768, phone: width < 640 };
}

export const ZOOM_VIEWPORTS: Viewport[] = [
  { name: "zoom-200", width: 640, height: 512, touch: true, phone: false },
  { name: "zoom-400", width: 320, height: 256, touch: true, phone: true },
];

/** Every viewport: the six widths, then the two zoom levels. */
export function allViewports(widths: readonly number[] = WIDTHS): Viewport[] {
  return [...widths.map(widthViewport), ...ZOOM_VIEWPORTS];
}

/** Playwright context options for a viewport in an engine. */
export function contextOptions(viewport: Viewport, engine: Engine) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch,
    // Chromium and WebKit honour isMobile (the meta viewport, overlay scrollbars); Firefox's
    // support is checked by the touch-media finding rather than assumed.
    isMobile: viewport.touch && engine !== "firefox",
    reducedMotion: "reduce" as const,
  };
}
