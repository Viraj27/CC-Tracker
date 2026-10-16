import type { Catalog, Rule } from "../catalog/schema";
import { addMonths, formatDate } from "./dates";
import { countedAccounts } from "./fiveTwentyFour";
import { cardFor, holdingAccountType, holdingIssuer, holdingName } from "./holdings";
import type { Holding } from "./types";

export type RuleOutcome = "pass" | "fail" | "manual";

export interface RuleEvaluation {
  rule: Rule;
  outcome: RuleOutcome;
  reasons: string[];
}

/** Evaluate an issuer rule against the owner's history as of `today`. */
export function evaluateRule(
  rule: Rule,
  holdings: Holding[],
  catalog: Pick<Catalog, "cards">,
  today: string,
): RuleEvaluation {
  const check = rule.check;
  const name = (h: Holding) => holdingName(h, cardFor(h, catalog));
  const familyOf = (h: Holding) => cardFor(h, catalog)?.family;

  switch (check.type) {
    case "x_in_y": {
      const accounts = countedAccounts(holdings, catalog, today, check);
      const window = check.window_days ? `${check.window_days} days` : `${check.window_months} months`;
      const reasons = [
        `${accounts.length} counted account(s) opened in the last ${window}; limit is ${check.max_new_accounts}.`,
        ...accounts.map((a) => `• ${a.name} — opened ${formatDate(a.approvalDate)}, drops off ${formatDate(a.dropOffDate)}`),
      ];
      const pass = accounts.length <= check.max_new_accounts;
      if (!pass) {
        const sorted = [...accounts].sort((a, b) => a.dropOffDate.localeCompare(b.dropOffDate));
        const needed = accounts.length - check.max_new_accounts;
        reasons.push(`Eligible again on ${formatDate(sorted[needed - 1].dropOffDate)} if no new accounts are opened.`);
      }
      return { rule, outcome: pass ? "pass" : "fail", reasons };
    }
    case "family_window": {
      const inFamily = holdings.filter((h) => familyOf(h) === check.family);
      const reasons: string[] = [];
      let pass = true;
      if (check.blocks_if_currently_held) {
        const held = inFamily.filter((h) => h.status === "open");
        if (held.length) {
          pass = false;
          reasons.push(`Currently hold: ${held.map(name).join(", ")}.`);
        }
      }
      const cutoff = addMonths(today, -check.months);
      const recent = inFamily.filter((h) => h.approvalDate > cutoff);
      if (recent.length) {
        pass = false;
        for (const h of recent) {
          reasons.push(
            `${name(h)} opened ${formatDate(h.approvalDate)} — within ${check.months} months until ${formatDate(addMonths(h.approvalDate, check.months))}.`,
          );
        }
      }
      reasons.push(
        "Uses account opening dates as a stand-in for bonus dates (bonus tracking is out of scope for v1).",
      );
      if (pass) reasons.unshift(`No ${check.family} card currently held or opened in the last ${check.months} months.`);
      return { rule, outcome: pass ? "pass" : "fail", reasons };
    }
    case "lifetime_family": {
      const hits = holdings.filter((h) => {
        const f = familyOf(h);
        return f !== undefined && check.families.includes(f);
      });
      return hits.length
        ? {
            rule,
            outcome: "fail",
            reasons: [`Have or have had: ${hits.map(name).join(", ")}.`],
          }
        : { rule, outcome: "pass", reasons: [`No history with ${check.families.join(", ")} cards found.`] };
    }
    case "max_open": {
      const open = holdings.filter((h) => {
        const card = cardFor(h, catalog);
        return (
          h.status === "open" &&
          holdingIssuer(h, card) === check.issuer &&
          check.counted_account_types.includes(holdingAccountType(h, card))
        );
      });
      const pass = open.length < check.max_open;
      return {
        rule,
        outcome: pass ? "pass" : "fail",
        reasons: [
          `${open.length} open ${check.issuer} card(s); limit is ${check.max_open}.`,
          ...open.map((h) => `• ${name(h)}`),
        ],
      };
    }
    case "manual":
      return { rule, outcome: "manual", reasons: ["This rule cannot be checked automatically — read the description."] };
  }
}
