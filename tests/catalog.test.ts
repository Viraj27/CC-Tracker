import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOM_CARD_COLOR, contrastRatio, inkFor } from "@/lib/cardColors";
import { CatalogError, loadCatalog } from "@/lib/catalog/loader";

const REQUIRED_CARDS = [
  "discover-it-cash-back",
  "chase-freedom-flex",
  "chase-sapphire-reserve",
  "wells-fargo-autograph",
  "capital-one-venture-x",
  "chase-united-explorer",
  "amex-delta-skymiles-gold",
];

describe("catalog/", () => {
  const catalog = loadCatalog(path.join(process.cwd(), "catalog"));

  it("contains all 7 v1 cards with earn rates, benefits and protections", () => {
    expect(catalog.cards.map((c) => c.id).sort()).toEqual([...REQUIRED_CARDS].sort());
    for (const card of catalog.cards) {
      expect(card.earn_rates.length, card.id).toBeGreaterThan(0);
      expect(card.benefits.length, card.id).toBeGreaterThan(0);
      expect(card.benefits.some((b) => b.kind === "protection"), `${card.id} protections`).toBe(true);
      expect(Array.isArray(card.downgrade_options)).toBe(true);
    }
  });

  it("every card's Wallet ink reads on its fill (≥ 4.5:1)", () => {
    for (const card of catalog.cards) {
      expect(card.card_ink, card.id).toBeDefined();
      expect(contrastRatio(card.brand_color, inkFor(card.brand_color, card.card_ink)), card.id).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(CUSTOM_CARD_COLOR, inkFor(CUSTOM_CARD_COLOR))).toBeGreaterThanOrEqual(4.5);
  });

  it("every fact has source_url + last_verified; unverified facts explain why", () => {
    const facts: { where: string; source_url: string; last_verified: string; verified: boolean; source_type?: string; note?: string }[] = [];
    for (const c of catalog.cards) {
      facts.push({ where: `${c.id} AF`, ...c.annual_fee });
      c.earn_rates.forEach((r) => facts.push({ where: `${c.id} earn ${r.label}`, ...r }));
      c.benefits.forEach((b) => facts.push({ where: `${c.id} ${b.id}`, ...b }));
      c.downgrade_options.forEach((d) => facts.push({ where: `${c.id} PC ${d.target_name}`, ...d }));
    }
    catalog.rules.forEach((r) => facts.push({ where: r.id, ...r }));
    catalog.perkDefaults.forEach((p) => facts.push({ where: p.id, ...p }));
    catalog.rotating.forEach((r) => {
      facts.push({ where: `${r.id} rate`, ...r.rate });
      r.quarters.forEach((q) => facts.push({ where: `${r.id} ${q.quarter}`, ...q }));
    });
    for (const f of facts) {
      expect(f.source_url, f.where).toMatch(/^https:\/\//);
      expect(f.last_verified, f.where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (!f.verified || f.source_type === "community") expect(f.note?.length, `${f.where} needs a note`).toBeGreaterThan(0);
    }
  });

  it("has the Chase 5/24 rule and the Freedom rotating calendar", () => {
    const rule524 = catalog.rules.find((r) => r.id === "chase-5-24");
    expect(rule524?.check.type).toBe("x_in_y");
    expect(rule524?.source_type).toBe("community");
    expect(catalog.rotating.find((r) => r.id === "chase-freedom")?.card_ids).toContain("chase-freedom-flex");
  });

  it("hash is stable across loads", () => {
    expect(loadCatalog(path.join(process.cwd(), "catalog")).hash).toBe(catalog.hash);
  });
});

describe("catalog validation", () => {
  function tmpCatalog(card: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-"));
    fs.mkdirSync(path.join(dir, "cards"));
    fs.writeFileSync(path.join(dir, "programs.yaml"), "programs:\n  - { id: p, name: P, kind: cash, default_cents_per_point: 1 }\n");
    fs.writeFileSync(path.join(dir, "cards", "demo-card.yaml"), card);
    return dir;
  }
  const base = `id: demo-card
name: Demo Card
issuer: demobank
network: visa
account_type: personal
rewards_program: p
brand_color: "#123456"
product_page: https://example.com
annual_fee: { amount: 0, first_year_waived: false, source_url: https://example.com, last_verified: 2026-01-01, verified: true }
earn_rates:
  - { categories: [other], label: All, rate: 1, unit: percent, source_url: https://example.com, last_verified: 2026-01-01, verified: true }
`;

  it("rejects unverified facts without a note", () => {
    const dir = tmpCatalog(`${base}benefits:
  - { id: x, kind: other, name: X, description: X, cycle: none, source_url: https://example.com, last_verified: 2026-01-01, verified: false }
`);
    expect(() => loadCatalog(dir)).toThrow(CatalogError);
  });

  it("rejects facts without provenance", () => {
    const dir = tmpCatalog(`${base}benefits:
  - { id: x, kind: other, name: X, description: X, cycle: none, verified: true }
`);
    expect(() => loadCatalog(dir)).toThrow(/source_url/);
  });

  it("accepts a valid minimal card", () => {
    expect(loadCatalog(tmpCatalog(`${base}benefits: []\n`)).cards).toHaveLength(1);
  });
});

describe("bundled catalog (Cloudflare Workers)", () => {
  it("src/generated/catalog.json is the validated catalog/ with the same hash", () => {
    const bundled = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "generated", "catalog.json"), "utf8"));
    const fromDisk = loadCatalog(path.join(process.cwd(), "catalog"));
    expect(bundled.hash).toBe(fromDisk.hash);
    expect(bundled).toEqual(JSON.parse(JSON.stringify(fromDisk)));
  });
});
