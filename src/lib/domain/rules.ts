import type { Card, Catalog, Rule } from "../catalog/schema";
import { addMonths, formatDate } from "./dates";
import { countedAccounts } from "./fiveTwentyFour";
import { cardFor, holdingAccountType, holdingIssuer, holdingName } from "./holdings";
import type { Holding } from "./types";

export type RuleOutcome = "pass" | "fail" | "manual";

export interface RuleEvaluation {
  rule: Rule;
  outcome: RuleOutcome;
  reasons: string[];
  /** For a fail: the first day it would pass if nothing else changes, when computable. */
  eligibleFrom?: string;
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
        const from = sorted[needed - 1].dropOffDate;
        reasons.push(`Eligible again on ${formatDate(from)} if no new accounts are opened.`);
        return { rule, outcome: "fail", reasons, eligibleFrom: from };
      }
      return { rule, outcome: "pass", reasons };
    }
    case "family_window": {
      const inFamily = holdings.filter((h) => familyOf(h) === check.family);
      const reasons: string[] = [];
      let pass = true;
      let heldBlocks = false;
      if (check.blocks_if_currently_held) {
        const held = inFamily.filter((h) => h.status === "open");
        if (held.length) {
          pass = false;
          heldBlocks = true;
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
      if (pass) return { rule, outcome: "pass", reasons: [`No ${check.family} card currently held or opened in the last ${check.months} months.`, ...reasons] };
      const from = heldBlocks ? undefined : recent.map((h) => addMonths(h.approvalDate, check.months)).sort().at(-1);
      return { rule, outcome: "fail", reasons, ...(from ? { eligibleFrom: from } : {}) };
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

// ------------------------------------------------------- Should I apply? --

/** Issuer rules that apply to a card (docs/SPEC-v7-phone-feedback.md §4.3). */
export function rulesForCard(card: Card, rules: Rule[]): Rule[] {
  return rules.filter((r) => {
    if (r.issuer !== card.issuer) return false;
    const to = r.applies_to;
    if (to?.families && !(card.family && to.families.includes(card.family))) return false;
    if (to?.account_types && !to.account_types.includes(card.account_type)) return false;
    return true;
  });
}

export type VerdictOutcome = "pass" | "fail" | "manual" | "none";

export interface Verdict {
  /** none: no rule with this effect is in the catalog for the card. */
  outcome: VerdictOutcome;
  /** The rules that decide a fail (or need a manual check). */
  rules: Rule[];
  /** For a fail: when every failing rule would pass, if computable for all of them. */
  eligibleFrom: string | null;
}

export interface ApplyEvaluation extends RuleEvaluation {
  /** Waived by the "Offer has no lifetime language" toggle. */
  waived: boolean;
}

export interface ApplyCheck {
  evaluations: ApplyEvaluation[];
  approval: Verdict;
  bonus: Verdict;
  /** Whether any applicable rule can be waived by an NLL offer (shows the toggle). */
  nllApplies: boolean;
}

function verdictFor(evals: ApplyEvaluation[]): Verdict {
  const live = evals.filter((e) => !e.waived);
  if (!evals.length) return { outcome: "none", rules: [], eligibleFrom: null };
  const fails = live.filter((e) => e.outcome === "fail");
  if (fails.length) {
    const dates = fails.map((e) => e.eligibleFrom);
    const eligibleFrom = dates.every((d): d is string => !!d) ? [...dates].sort().at(-1)! : null;
    return { outcome: "fail", rules: fails.map((e) => e.rule), eligibleFrom };
  }
  const manual = live.filter((e) => e.outcome === "manual");
  if (manual.length) return { outcome: "manual", rules: manual.map((e) => e.rule), eligibleFrom: null };
  return { outcome: "pass", rules: [], eligibleFrom: null };
}

/** Plain approval and welcome-bonus verdicts for applying for `card` today. */
export function checkApplication(
  card: Card,
  holdings: Holding[],
  catalog: Pick<Catalog, "cards" | "rules">,
  today: string,
  opts: { nll: boolean } = { nll: false },
): ApplyCheck {
  const evaluations = rulesForCard(card, catalog.rules).map((rule) => ({
    ...evaluateRule(rule, holdings, catalog, today),
    waived: opts.nll && !!rule.nll_waiver,
  }));
  return {
    evaluations,
    approval: verdictFor(evaluations.filter((e) => e.rule.effect === "approval")),
    bonus: verdictFor(evaluations.filter((e) => e.rule.effect === "bonus")),
    nllApplies: evaluations.some((e) => !!e.rule.nll_waiver),
  };
}
