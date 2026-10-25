/** Bring a section into view on the canvas (after Add, or "Show" on a check). */
export function scrollCanvasTo(sectionId: string, from: Document = document): void {
  // Two frames: the section is drawn into the iframe a frame after Puck's state changes.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const frame = from.querySelector<HTMLIFrameElement>("[data-gs-canvas] iframe");
      frame?.contentDocument?.querySelector(`[data-puck-component="${CSS.escape(sectionId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }),
  );
}
