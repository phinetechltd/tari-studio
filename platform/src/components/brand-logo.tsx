import Image from "next/image";

import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The product logo (src/lib/brand.ts). `variant="mark"` is the square T-and-play icon (for a
 * collapsed sidebar or a small avatar); the default is the horizontal lock-up.
 * `tone="light"` uses the navy wordmark, for light backgrounds.
 */
export function BrandLogo({
  variant = "horizontal",
  tone = "dark",
  height = 32,
  className,
  priority,
}: {
  variant?: "horizontal" | "mark" | "stacked";
  tone?: "dark" | "light" | "afro";
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  if (variant === "mark") {
    return (
      <Image
        src={tone === "afro" ? PRODUCT_LOGO.afroMark : PRODUCT_LOGO.mark}
        alt={PRODUCT_NAME}
        width={height}
        height={height}
        className={cn("shrink-0", className)}
        priority={priority}
      />
    );
  }
  const afro = tone === "afro";
  const file = afro
    ? variant === "stacked" ? PRODUCT_LOGO.afroStacked : PRODUCT_LOGO.afroHorizontal
    : variant === "stacked"
      ? tone === "dark" ? PRODUCT_LOGO.stackedDark : PRODUCT_LOGO.stacked
      : tone === "dark" ? PRODUCT_LOGO.horizontalDark : PRODUCT_LOGO.horizontal;
  const width = Math.round((file.width / file.height) * height);
  const img = (f: { src: string }, extra?: string) => (
    <Image
      src={f.src}
      alt={extra ? "" : PRODUCT_NAME}
      aria-hidden={extra ? true : undefined}
      width={width}
      height={height}
      className={cn("shrink-0", extra, className)}
      style={{ height, width: "auto" }}
      priority={priority}
    />
  );
  if (!afro) return img(file);
  // The afro lock-up has a cream wordmark (dark theme) and an umber one (light); CSS shows the right one.
  const light = variant === "stacked" ? PRODUCT_LOGO.afroStackedLight : PRODUCT_LOGO.afroHorizontalLight;
  return (
    <>
      {img(file, "logo-on-dark")}
      {img(light, "logo-on-light")}
    </>
  );
}
