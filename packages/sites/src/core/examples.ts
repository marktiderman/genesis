/**
 * Made-up brands for demos, tests and docs. They are not anyone's real
 * business.
 */
import type { SiteBrand } from "./theme";

export const exampleBrands = Object.freeze({
  riverside: {
    name: "Riverside Works",
    colors: { primary: "#0f766e", primaryDark: "#2dd4bf" },
    fonts: { heading: "space-grotesk", body: "inter" },
  },
  hilltop: {
    name: "Hilltop Collective",
    colors: { primary: "#b45309", primaryDark: "#fbbf24" },
    fonts: { heading: "playfair-display", body: "work-sans" },
  },
} satisfies Record<string, SiteBrand>);
