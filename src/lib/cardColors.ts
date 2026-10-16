/** Colours for the Wallet's physical cards. Generic fills only: no issuer art. */

/** Fill for cards that aren't in the catalog. */
export const CUSTOM_CARD_COLOR = "#3A3D44";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Card-face text colour: the catalog's `card_ink`, else whichever of near-black/white reads better. */
export function inkFor(fill: string, ink?: string): string {
  if (ink) return ink;
  return contrastRatio(fill, "#FFFFFF") >= contrastRatio(fill, "#15171C") ? "#FFFFFF" : "#15171C";
}
