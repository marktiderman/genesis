/**
 * The conformance matrix: engines × viewports (docs/RESPONSIVE.md rule 10, WCAG 1.4.10).
 *
 * Playwright has no browser zoom. Zooming a 1280×1024 window to 200% or 400% lays the page out
 * in a 640×512 or 320×256 CSS viewport, so zoom is those viewports (device pixel ratio doesn't
 * change layout). A zoomed desktop keeps its mouse: no touch, so the (pointer: fine) and hover
 * layouts at narrow widths are what the zoom viewports test. Phone and tablet widths run with touch.
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
  /** The browser's default text size is doubled (WCAG 1.4.4); Chromium only, through its font-size setting. */
  textZoom?: boolean;
}

export const WIDTHS = [320, 375, 768, 1024, 1280, 1440] as const;

const HEIGHTS: Record<number, number> = { 320: 640, 375: 812, 768: 1024, 1024: 768, 1280: 800, 1440: 900 };

export function widthViewport(width: number): Viewport {
  return { name: String(width), width, height: HEIGHTS[width] ?? 900, touch: width <= 768, phone: width < 640 };
}

export const ZOOM_VIEWPORTS: Viewport[] = [
  { name: "zoom-200", width: 640, height: 512, touch: false, phone: false },
  { name: "zoom-400", width: 320, height: 256, touch: false, phone: true },
];

/**
 * Text at 200% (WCAG 1.4.4), the browser's own text-size setting rather than page zoom: rem and em
 * grow, px doesn't. Chromium only (it sets the setting through CDP).
 */
export const TEXT_ZOOM_VIEWPORT: Viewport = { name: "text-200", width: 1280, height: 800, touch: false, phone: false, textZoom: true };

/** Every viewport: the six widths, the two zoom levels, then text at 200%. */
export function allViewports(widths: readonly number[] = WIDTHS): Viewport[] {
  return [...widths.map(widthViewport), ...ZOOM_VIEWPORTS, TEXT_ZOOM_VIEWPORT];
}

/** Whether an engine runs a viewport: text zoom needs Chromium. */
export function runsIn(viewport: Viewport, engine: Engine): boolean {
  return !viewport.textZoom || engine === "chromium";
}

/** Playwright context options for a viewport in an engine. */
export function contextOptions(viewport: Viewport, engine: Engine) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch,
    // Playwright doesn't support isMobile in Firefox; hasTouch alone there, and the touch-media
    // finding reports when (pointer: coarse) doesn't follow.
    isMobile: viewport.touch && engine !== "firefox",
    reducedMotion: "reduce" as const,
  };
}
