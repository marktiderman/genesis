/**
 * Demo brands for the PublicPage and AuthPage stories. Accents are a host's
 * data, not Genesis tokens, which is why they live in a fixture. Images are
 * local data URLs (no network).
 */
import type { PublicBrand } from "@marktiderman/genesis-ui/layout";

const svg = (body: string, viewBox = "0 0 1200 300") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`)}`;

/** Emerald, #10b981: 2.5:1 with white, so the page darkens it for text and buttons. */
export const LOW_CONTRAST_BRAND: PublicBrand = {
  name: "Riverside Physio",
  accent: "#10b981",
  logoUrl: svg('<circle cx="32" cy="32" r="30" fill="#10b981"/><path d="M18 36c8-14 20-14 28 0" stroke="#fff" stroke-width="6" fill="none"/>', "0 0 64 64"),
  headerImageUrl: svg(
    '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#047857"/></linearGradient></defs><rect width="1200" height="300" fill="url(#g)"/>',
  ),
};

/** Indigo, #4338ca: already past 4.5:1, so it is used as given. */
export const PASSING_BRAND: PublicBrand = {
  name: "Northwind Coaching",
  accent: "#4338ca",
  logoUrl: svg('<rect x="4" y="4" width="56" height="56" rx="14" fill="#4338ca"/><path d="M20 44V20l24 24V20" stroke="#fff" stroke-width="6" fill="none"/>', "0 0 64 64"),
};

/** A logo mark for the auth stories. */
export const AUTH_LOGO = PASSING_BRAND.logoUrl!;

/** A soft illustration for AuthPage's side panel. */
export const AUTH_ILLUSTRATION = svg(
  '<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs><rect width="800" height="1000" fill="url(#a)"/><circle cx="560" cy="300" r="180" fill="#fff" fill-opacity=".18"/><circle cx="240" cy="720" r="240" fill="#fff" fill-opacity=".12"/>',
  "0 0 800 1000",
);
