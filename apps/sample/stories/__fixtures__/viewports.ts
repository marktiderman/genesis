/** The two widths the public layouts are checked at: a laptop and an iPhone mini/SE-class phone. */
export const PUBLIC_VIEWPORTS = {
  desktop1440: { name: "Desktop 1440", styles: { width: "1440px", height: "900px" }, type: "desktop" as const },
  phone375: { name: "Phone 375", styles: { width: "375px", height: "812px" }, type: "mobile" as const },
};
