import { describe, expect, it } from "vitest";
import type { RotatingProgram } from "@/lib/catalog/schema";
import { rankCards } from "@/lib/domain/bestCard";
import { card, catalog, holding } from "./fixtures";

const prov = { source_url: "https://example.com", last_verified: "2026-01-01", verified: true };

const rotating: RotatingProgram = {
  id: "demo-rotating",
  name: "Demo Rotating",
  card_ids: ["demo-rotator"],
  rate: { value: 5, unit: "percent", cap: "Up to $1,000 per quarter", ...prov },
  calendar_url: "https://example.com/calendar",
  quarters: [
    { quarter: "2026-Q4", announced: true, categories: [{ name: "Demo grocers", maps_to: ["groceries"] }], activation_deadline: "2026-12-14", ...prov },
  ],
};

const cat = catalog({
  cards: [
    card({
      id: "demo-diner",
      name: "Demo Diner",
      earn_rates: [
        { categories: ["dining"], label: "Restaurants", rate: 3, unit: "points_per_dollar", ...prov },
        { categories: ["other"], label: "Everything else", rate: 1, unit: "points_per_dollar", ...prov },
      ],
    }),
    card({
      id: "demo-flat",
      name: "Demo Flat",
      rewards_program: "test-cash",
      earn_rates: [{ categories: ["other"], label: "Everything", rate: 2, unit: "percent", conditions: "Demo condition", ...prov }],
    }),
    card({
      id: "demo-rotator",
      name: "Demo Rotator",
      rotating_program: "demo-rotating",
      earn_rates: [{ categories: ["other"], label: "Everything else", rate: 1, unit: "percent", ...prov }],
    }),
  ],
  rotating: [rotating],
});

const holdings = [
  holding({ id: "diner", catalogCardId: "demo-diner" }),
  holding({ id: "flat", catalogCardId: "demo-flat" }),
  holding({ id: "rot", catalogCardId: "demo-rotator" }),
  holding({ id: "closed", catalogCardId: "demo-diner", status: "closed" }),
];
const today = "2026-10-16";

describe("best-card ranking", () => {
  it("ranks by rate for the category and falls back to the base rate", () => {
    const r = rankCards("dining", holdings, cat, { centsPerPoint: {} }, [], today);
    expect(r.map((x) => [x.holdingId, x.rate])).toEqual([
      ["diner", 3],
      ["flat", 2],
      ["rot", 1],
    ]);
    expect(r[1].conditions).toEqual(["Demo condition"]);
  });

  it("excludes closed cards", () => {
    expect(rankCards("dining", holdings, cat, { centsPerPoint: {} }, [], today).some((x) => x.holdingId === "closed")).toBe(false);
  });

  it("uses cents-per-point valuations to compare programs", () => {
    const r = rankCards("other", holdings, cat, { centsPerPoint: { "test-points": 2.5 } }, [], today);
    expect(r.map((x) => [x.holdingId, x.centsPerDollar])).toEqual([
      ["diner", 2.5],
      ["rot", 2.5],
      ["flat", 2],
    ]);
  });

  it("includes the rotating 5% category only when activated", () => {
    const notActive = rankCards("groceries", holdings, cat, { centsPerPoint: {} }, [], today);
    const rot = notActive.find((x) => x.holdingId === "rot")!;
    expect(rot.rate).toBe(1);
    expect(rot.hint).toMatch(/activate/);

    const active = rankCards(
      "groceries",
      holdings,
      cat,
      { centsPerPoint: {} },
      [{ id: "a", holdingId: "rot", quarter: "2026-Q4", activated: true, date: "2026-10-01" }],
      today,
    );
    expect(active[0]).toMatchObject({ holdingId: "rot", rate: 5, source: "rotating" });
    expect(active[0].conditions).toContain("Up to $1,000 per quarter");
  });

  it("rotating bonus does not apply outside its quarter", () => {
    const r = rankCards(
      "groceries",
      holdings,
      cat,
      { centsPerPoint: {} },
      [{ id: "a", holdingId: "rot", quarter: "2026-Q4", activated: true, date: "2026-10-01" }],
      "2027-01-02",
    );
    expect(r.find((x) => x.holdingId === "rot")!.rate).toBe(1);
  });
});
