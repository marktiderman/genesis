import type { ReactNode } from "react";
import type { AppBrand, AppBrandImage } from "@marktiderman/genesis-design-system/app-styles";

/** What `appShellBrandProps` gives: AppShell's `appName` and `logo`, from a brand. */
export interface AppShellBrandProps {
  appName: string;
  logo?: ReactNode;
}

function BrandImage({ image, className }: { image: AppBrandImage; className: string }) {
  if (!image.darkSrc) return <img src={image.src} alt={image.alt} className={className} />;
  // Both, each shown in its appearance (`.dark` on the root, as AppShell's toggle sets it).
  return (
    <>
      <img src={image.src} alt={image.alt} className={`${className} dark:hidden`} />
      <img src={image.darkSrc} alt={image.alt} className={`${className} hidden dark:block`} />
    </>
  );
}

/**
 * AppShell's `appName` and `logo` from an app brand: its `appName` (else `fallbackName`), and its
 * square `mark` in the shell's logo tile (else its `logo`), each with its dark version. Spread
 * them under any of the app's own:
 *
 * ```tsx
 * <AppShell {...appShellBrandProps(acmeBrand, "Acme")} navigation={nav}>…</AppShell>
 * ```
 *
 * Nothing but the name for a brand without images, so AppShell's letter tile (`appLogo`) stands.
 *
 * @stability Beta
 */
export function appShellBrandProps(brand: Pick<AppBrand, "appName" | "logo" | "mark" | "label"> | null | undefined, fallbackName?: string): AppShellBrandProps {
  const appName = brand?.appName ?? fallbackName ?? brand?.label ?? "";
  const image = brand?.mark ?? brand?.logo;
  if (!image) return { appName };
  // The mark sits beside the name, which already says it: decorative unless it has words.
  return { appName, logo: <BrandImage image={image} className="h-full w-full object-contain" /> };
}
