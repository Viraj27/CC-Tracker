import type { Benefit, Card, Catalog } from "../catalog/schema";
import type { AccountType, Holding } from "./types";

export function cardFor(holding: Holding, catalog: Pick<Catalog, "cards">): Card | null {
  if (!holding.catalogCardId) return null;
  return catalog.cards.find((c) => c.id === holding.catalogCardId) ?? null;
}

export function holdingName(holding: Holding, card: Card | null): string {
  return holding.nickname || card?.name || holding.catalogCardId || "Unnamed card";
}

export function holdingIssuer(holding: Holding, card: Card | null): string | null {
  return holding.issuer ?? card?.issuer ?? null;
}

export function holdingAccountType(holding: Holding, card: Card | null): AccountType {
  return holding.accountType ?? card?.account_type ?? "personal";
}

export function isOpen(holding: Holding): boolean {
  return holding.status === "open";
}

/**
 * A benefit's one-line title ("DoorDash", "Lyft"): the catalog's `short_name`,
 * else the name without a leading amount, a trailing "credit" or a parenthetical.
 */
export function benefitShortName(b: Pick<Benefit, "name" | "short_name">): string {
  if (b.short_name) return b.short_name;
  const s = b.name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^\$[\d,.]+\s+/, "")
    .replace(/\s+credit$/i, "")
    .trim();
  return s ? s[0].toUpperCase() + s.slice(1) : b.name;
}
