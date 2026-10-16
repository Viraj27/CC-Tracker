import type { Catalog, RuleCheck } from "../catalog/schema";
import { addDays, addMonths } from "./dates";
import { cardFor, holdingAccountType, holdingIssuer, holdingName } from "./holdings";
import type { Holding } from "./types";

export type XInYParams = Extract<RuleCheck, { type: "x_in_y" }>;

/** Fallback when rules/chase.yaml cannot be loaded: personal accounts, 24 months. */
export const DEFAULT_524: XInYParams = {
  type: "x_in_y",
  max_new_accounts: 4,
  window_months: 24,
  counted_account_types: ["personal"],
  business_counted_issuers: [],
  counted_issuers: null,
};

export interface CountedAccount {
  holdingId: string;
  name: string;
  approvalDate: string;
  /** First day the account no longer counts. */
  dropOffDate: string;
}

/**
 * Is this holding a new account opening that counts under the rule?
 * Product changes keep the original account, so only the original holding
 * (the one without `productChangedFromId`) is an opening.
 */
export function countsTowardRule(
  holding: Holding,
  catalog: Pick<Catalog, "cards">,
  params: XInYParams,
): boolean {
  if (holding.productChangedFromId) return false;
  const card = cardFor(holding, catalog);
  const issuer = holdingIssuer(holding, card);
  if (params.counted_issuers && (!issuer || !params.counted_issuers.includes(issuer))) return false;
  const type = holdingAccountType(holding, card);
  if (params.counted_account_types.includes(type)) return true;
  return type === "business" && !!issuer && params.business_counted_issuers.includes(issuer);
}

export function dropOffDate(approvalDate: string, params: XInYParams): string {
  if (params.window_days) return addDays(approvalDate, params.window_days);
  return addMonths(approvalDate, params.window_months ?? 24);
}

/**
 * Accounts counted in the window as of `today`, oldest first. An account
 * opened exactly `window` ago has dropped off (its drop-off date is today).
 */
export function countedAccounts(
  holdings: Holding[],
  catalog: Pick<Catalog, "cards">,
  today: string,
  params: XInYParams = DEFAULT_524,
): CountedAccount[] {
  return holdings
    .filter((h) => countsTowardRule(h, catalog, params) && h.approvalDate <= today)
    .map((h) => ({
      holdingId: h.id,
      name: holdingName(h, cardFor(h, catalog)),
      approvalDate: h.approvalDate,
      dropOffDate: dropOffDate(h.approvalDate, params),
    }))
    .filter((a) => a.dropOffDate > today)
    .sort((a, b) => a.approvalDate.localeCompare(b.approvalDate));
}

export interface FiveTwentyFourStatus {
  count: number;
  /** The rule fails when count > max_new_accounts (Chase: at 5 or more). */
  max: number;
  underLimit: boolean;
  accounts: CountedAccount[];
  nextDropOff: CountedAccount | null;
  /** Count over time: one point today, then one at each drop-off. */
  timeline: { date: string; count: number }[];
}

export function fiveTwentyFourStatus(
  holdings: Holding[],
  catalog: Pick<Catalog, "cards">,
  today: string,
  params: XInYParams = DEFAULT_524,
): FiveTwentyFourStatus {
  const accounts = countedAccounts(holdings, catalog, today, params);
  const byDrop = [...accounts].sort((a, b) => a.dropOffDate.localeCompare(b.dropOffDate));
  const timeline = [{ date: today, count: accounts.length }];
  let remaining = accounts.length;
  for (const a of byDrop) {
    remaining -= 1;
    const last = timeline[timeline.length - 1];
    if (last.date === a.dropOffDate) last.count = remaining;
    else timeline.push({ date: a.dropOffDate, count: remaining });
  }
  return {
    count: accounts.length,
    max: params.max_new_accounts,
    underLimit: accounts.length <= params.max_new_accounts,
    accounts,
    nextDropOff: byDrop[0] ?? null,
    timeline,
  };
}

/** The x_in_y params of the Chase 5/24 rule from the catalog, if present. */
export function chase524Params(catalog: Pick<Catalog, "rules">): XInYParams {
  const rule = catalog.rules.find((r) => r.id === "chase-5-24");
  return rule && rule.check.type === "x_in_y" ? rule.check : DEFAULT_524;
}
