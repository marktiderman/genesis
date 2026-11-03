/** The zoom and dismiss rules NativeLightbox's photo pages use (moved from genesis-chat's viewer). */
import { describe, expect, it } from "vitest";
import {
  LIGHTBOX_DISMISS_DISTANCE,
  LIGHTBOX_MAX_ZOOM,
  lightboxPanLimit,
  lightboxPinchScale,
  lightboxShouldDismiss,
  lightboxTouchDistance,
} from "../lightbox-zoom";

describe("lightbox zoom rules", () => {
  it("closes on a long pull or a quick flick down, not a nudge", () => {
    expect(lightboxShouldDismiss(LIGHTBOX_DISMISS_DISTANCE + 1, 0)).toBe(true);
    expect(lightboxShouldDismiss(30, 1.5)).toBe(true);
    expect(lightboxShouldDismiss(20, 3)).toBe(false);
    expect(lightboxShouldDismiss(60, 0.2)).toBe(false);
  });

  it("zooms with the fingers' spread, between 0.8× and the maximum", () => {
    expect(lightboxPinchScale(1, 100, 200)).toBe(2);
    expect(lightboxPinchScale(2, 100, 1000)).toBe(LIGHTBOX_MAX_ZOOM);
    expect(lightboxPinchScale(1, 100, 10)).toBe(0.8);
    expect(lightboxPinchScale(1.5, 0, 50)).toBe(1.5);
  });

  it("measures two touches, and pans only as far as the zoomed photo reaches", () => {
    expect(lightboxTouchDistance([{ pageX: 0, pageY: 0 }, { pageX: 3, pageY: 4 }])).toBe(5);
    expect(lightboxTouchDistance([{ pageX: 0, pageY: 0 }])).toBe(0);
    expect(lightboxPanLimit(1, 400)).toBe(0);
    expect(lightboxPanLimit(2, 400)).toBe(200);
  });
});
