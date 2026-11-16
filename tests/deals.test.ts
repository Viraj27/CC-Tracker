import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureFeed } from "../e2e/feedFixture";
import { CatalogError, loadCatalog } from "@/lib/catalog/loader";
import { type ChangelogEntry, ChangelogEntrySchema, type Deal, DealSchema, FeedMetaSchema, FeedSourcesFileSchema } from "@/lib/catalog/schema";
import {
  cardChangedChip,
  changeLine,
  dealEnds,
  feedStatus,
  groupDeals,
  guardRun,
  missingBenefitIds,
  offerHistory,
  pruneDeals,
  recentChanges,
  reportUrl,
  unseenDeals,
} from "@/lib/domain/deals";
import { criteriaOf, findCards } from "@/lib/domain/findCard";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { buildExport, parseImport } from "@/lib/importExport";
import { card, catalog, holding, userData } from "./fixtures";

// Everything here is invented: fake cards, fake posts.
const TODAY = "2026-11-13";

const deal = (over: Partial<Deal> & Pick<Deal, "id">): Deal => ({
  kind: "shopping",
  title: `Deal ${over.id}`,
  url: "https://example.com/post",
  source: "example-feed",
  published: "2026-11-10",
  added: "2026-11-10",
  expires: null,
  card_id: null,
  issuer: null,
  ...over,
});

const change = (over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  date: "2026-11-10",
  card_id: "held",
  path: "benefits.dining.amount",
  label: "Dining credit",
  from: "$5/mo",
  to: "$10/mo",
  effective: null,
  source_url: "https://example.com/terms",
  confirmed_by: "official_page",
  ...over,
});

describe("feed schemas", () => {
  it("accept the e2e fixture feed", () => {
    const feed = fixtureFeed(TODAY);
    expect(FeedSourcesFileSchema.parse({ sources: feed.sources }).sources).toHaveLength(1);
    for (const d of feed.deals) expect(DealSchema.parse(d)).toEqual(d);
    for (const e of feed.changelog) expect(ChangelogEntrySchema.parse(e)).toEqual(e);
    expect(FeedMetaSchema.parse(feed.meta)).toEqual(feed.meta);
  });

  it("default card_id and issuer to null", () => {
    const { card_id: _c, issuer: _i, ...bare } = deal({ id: "a" });
    expect(DealSchema.parse(bare)).toMatchObject({ card_id: null, issuer: null });
  });

  it("reject an unknown kind, a bad id, a bad date, a non-URL and a title that is too long", () => {
    expect(DealSchema.safeParse({ ...deal({ id: "a" }), kind: "rumour" }).success).toBe(false);
    expect(DealSchema.safeParse(deal({ id: "Has Spaces" })).success).toBe(false);
    expect(DealSchema.safeParse(deal({ id: "a", published: "Nov 10" })).success).toBe(false);
    expect(DealSchema.safeParse(deal({ id: "a", url: "not a url" })).success).toBe(false);
    expect(DealSchema.safeParse(deal({ id: "a", title: "x".repeat(161) })).success).toBe(false);
  });

  it("a reported change must name its card", () => {
    expect(DealSchema.safeParse(deal({ id: "a", kind: "reported_change" })).success).toBe(false);
    expect(DealSchema.safeParse(deal({ id: "a", kind: "reported_change", card_id: "held" })).success).toBe(true);
  });

  it("a changelog entry needs a source and a known way it was confirmed", () => {
    expect(ChangelogEntrySchema.safeParse({ ...change(), source_url: undefined }).success).toBe(false);
    expect(ChangelogEntrySchema.safeParse({ ...change(), confirmed_by: "a hunch" }).success).toBe(false);
    expect(FeedMetaSchema.safeParse({ ran_at: null, items_seen: -1, status: "never" }).success).toBe(false);
  });
});

describe("the loader and the feed", () => {
  function tmpCatalog(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-"));
    fs.mkdirSync(path.join(dir, "cards"));
    fs.mkdirSync(path.join(dir, "feed"));
    fs.writeFileSync(path.join(dir, "programs.yaml"), "programs:\n  - { id: p, name: P, kind: cash, default_cents_per_point: 1 }\n");
    fs.writeFileSync(
      path.join(dir, "cards", "demo-card.yaml"),
      `id: demo-card
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
benefits: []
`,
    );
    fs.writeFileSync(path.join(dir, "feed", "sources.yaml"), "sources:\n  - { id: example-feed, name: Example, url: https://example.com/feed/, kind: rss, trust: community }\n");
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, "feed", name), text);
    return dir;
  }

  it("a catalog without feed files loads with an empty feed", () => {
    const dir = tmpCatalog({});
    fs.rmSync(path.join(dir, "feed"), { recursive: true });
    expect(loadCatalog(dir).feed).toEqual({ sources: [], deals: [], changelog: [], meta: { ran_at: null, items_seen: 0, status: "never" } });
  });

  it("the committed feed validates and the feed is part of the content hash", () => {
    const committed = loadCatalog(path.join(process.cwd(), "catalog"));
    // Issuer pages only for now (owner's decision): no news feed is configured.
    expect(committed.feed.sources).toEqual([]);
    const a = loadCatalog(tmpCatalog({ "deals.json": "[]" }));
    const b = loadCatalog(tmpCatalog({ "deals.json": JSON.stringify([deal({ id: "a" })]) }));
    expect(b.feed.deals).toHaveLength(1);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects feed files that are not JSON or not in the schema", () => {
    expect(() => loadCatalog(tmpCatalog({ "deals.json": "[{" }))).toThrow(/invalid JSON/);
    expect(() => loadCatalog(tmpCatalog({ "deals.json": JSON.stringify([{ id: "a" }]) }))).toThrow(/feed validation failed/);
    expect(() => loadCatalog(tmpCatalog({ "changelog.json": JSON.stringify([{ ...change(), date: "yesterday" }]) }))).toThrow(CatalogError);
    expect(() => loadCatalog(tmpCatalog({ "meta.json": JSON.stringify({ ran_at: null, items_seen: 0, status: "maybe" }) }))).toThrow(CatalogError);
  });

  it("rejects duplicate deal ids and references to unknown sources, cards and issuers", () => {
    const load = (deals: Deal[], changelog: ChangelogEntry[] = []) => () => loadCatalog(tmpCatalog({ "deals.json": JSON.stringify(deals), "changelog.json": JSON.stringify(changelog) }));
    expect(load([deal({ id: "a" }), deal({ id: "a" })])).toThrow(/duplicate deal id "a"/);
    expect(load([deal({ id: "a", source: "nowhere" })])).toThrow(/unknown source "nowhere"/);
    expect(load([deal({ id: "a", card_id: "no-such-card" })])).toThrow(/unknown card_id "no-such-card"/);
    expect(load([deal({ id: "a", issuer: "no-such-bank" })])).toThrow(/unknown issuer "no-such-bank"/);
    expect(load([], [change({ card_id: "no-such-card" })])).toThrow(/unknown card_id "no-such-card"/);
    expect(load([deal({ id: "a", card_id: "demo-card", issuer: "demobank" })], [change({ card_id: "demo-card" })])).not.toThrow();
  });
});

describe("retention", () => {
  it("an item shows through its expiry date, and no longer", () => {
    const d = deal({ id: "a", expires: "2026-11-13" });
    expect(pruneDeals([d], "2026-11-13")).toHaveLength(1);
    expect(pruneDeals([d], "2026-11-14")).toHaveLength(0);
  });

  it("without an expiry it leaves 30 days after it was published", () => {
    const d = deal({ id: "a", published: "2026-10-14" });
    expect(dealEnds(d)).toBe("2026-11-13");
    expect(pruneDeals([d], "2026-11-13")).toHaveLength(1);
    expect(pruneDeals([d], "2026-11-14")).toHaveLength(0);
  });

  it("a reported change is kept for 30 days from the run that added it", () => {
    const d = deal({ id: "a", kind: "reported_change", card_id: "held", published: "2026-09-01", added: "2026-10-20" });
    expect(dealEnds(d)).toBe("2026-11-19");
    expect(pruneDeals([d], TODAY)).toHaveLength(1);
    expect(pruneDeals([d], "2026-11-20")).toHaveLength(0);
  });

  it("sorts newest first, then by id", () => {
    const out = pruneDeals([deal({ id: "b", published: "2026-11-01" }), deal({ id: "z", published: "2026-11-12" }), deal({ id: "a", published: "2026-11-01" })], TODAY);
    expect(out.map((d) => d.id)).toEqual(["z", "a", "b"]);
  });
});

describe("grouping for the owner", () => {
  const cat = catalog({ cards: [card({ id: "held", issuer: "testbank" }), card({ id: "other", issuer: "otherbank" })] });
  const open = [holding({ id: "h1", catalogCardId: "held" })];
  const ids = (g: ReturnType<typeof groupDeals>) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, (v as Deal[]).map((d) => d.id)]));
  const deals = [
    deal({ id: "by-card", card_id: "held" }),
    deal({ id: "by-issuer", kind: "card_linked", issuer: "testbank" }),
    deal({ id: "other-issuer", kind: "card_linked", issuer: "otherbank" }),
    deal({ id: "offer", kind: "card_offer", card_id: "other", issuer: "otherbank" }),
    deal({ id: "offer-same-issuer", kind: "card_offer", issuer: "testbank" }),
    deal({ id: "plain" }),
    deal({ id: "reported", kind: "reported_change", card_id: "held" }),
    deal({ id: "gone", expires: "2026-11-01" }),
  ];

  it("card match and issuer match are yours; the rest fall into offers, shopping and reported", () => {
    expect(ids(groupDeals(deals, open, cat, [], TODAY))).toEqual({
      yours: ["by-card", "by-issuer"],
      // An offer for a card you do not hold is a card offer even when you bank with the issuer.
      cardOffers: ["offer", "offer-same-issuer"],
      shopping: ["other-issuer", "plain"],
      reported: ["reported"],
      dismissed: [],
    });
  });

  it("with no holdings nothing is yours", () => {
    const g = groupDeals(deals, [], cat, [], TODAY);
    expect(g.yours).toEqual([]);
    expect(g.shopping.map((d) => d.id)).toEqual(["by-card", "by-issuer", "other-issuer", "plain"]);
  });

  it("closed cards do not count; a hand-entered card counts by its issuer", () => {
    expect(groupDeals(deals, [holding({ id: "h1", catalogCardId: "held", status: "closed", closedDate: "2026-01-01" })], cat, [], TODAY).yours).toEqual([]);
    const manual = groupDeals(deals, [holding({ id: "h2", issuer: "otherbank" })], cat, [], TODAY);
    expect(manual.yours.map((d) => d.id)).toEqual(["other-issuer"]);
  });

  it("dismissed items move to their own list, whatever their kind; expired ones are gone either way", () => {
    const g = groupDeals(deals, open, cat, ["by-card", "reported", "gone", "not-in-feed"], TODAY);
    expect(g.dismissed.map((d) => d.id)).toEqual(["by-card", "reported"]);
    expect(g.yours.map((d) => d.id)).toEqual(["by-issuer"]);
    expect(g.reported).toEqual([]);
  });

  it("the dot counts yours added after the page was last opened", () => {
    const yours = [deal({ id: "a", added: "2026-11-10" }), deal({ id: "b", added: "2026-11-12" })];
    expect(unseenDeals(yours, null)).toBe(2);
    expect(unseenDeals(yours, "2026-11-10T06:00:00Z")).toBe(1);
    expect(unseenDeals(yours, "2026-11-12T06:00:00Z")).toBe(0);
    expect(unseenDeals([], null)).toBe(0);
  });
});

describe("the run date", () => {
  const meta = (ran_at: string | null, status: "ok" | "failed" | "never" = "ok") => ({ ran_at, items_seen: 0, status });
  it("reads Updated until the run is more than 3 days old, then warns", () => {
    expect(feedStatus(meta("2026-11-13T06:00:00Z"), TODAY)).toEqual({ text: "Updated Nov 13", stale: false, failed: false });
    expect(feedStatus(meta("2026-11-10T06:00:00Z"), TODAY)).toMatchObject({ text: "Updated Nov 10", stale: false });
    expect(feedStatus(meta("2026-11-09T06:00:00Z"), TODAY)).toMatchObject({ text: "Not updated since Nov 9", stale: true });
  });
  it("says so before the first run and when the last run failed", () => {
    expect(feedStatus(meta(null, "never"), TODAY)).toEqual({ text: "Not updated yet", stale: true, failed: false });
    expect(feedStatus(meta("2026-11-13T06:00:00Z", "failed"), TODAY)).toMatchObject({ stale: false, failed: true });
  });
});

describe("what changed", () => {
  const log = [
    change({ date: "2026-11-10" }),
    change({ date: "2026-11-12", card_id: "other", path: "public_offer.bonus", label: "Public offer", from: 60000, to: 75000, confirmed_by: "community_post" }),
    change({ date: "2026-09-14", path: "benefits.old.amount" }), // exactly 60 days back
    change({ date: "2026-09-13", path: "benefits.older.amount" }),
    change({ date: "2026-11-14", path: "benefits.future.amount" }), // a later run: not shown yet
  ];

  it("lists the last 60 days, newest first", () => {
    expect(recentChanges(log, TODAY).map((e) => `${e.date} ${e.card_id}`)).toEqual(["2026-11-12 other", "2026-11-10 held", "2026-09-14 held"]);
  });

  it("filters by card and by age", () => {
    expect(recentChanges(log, TODAY, undefined, "held").map((e) => e.date)).toEqual(["2026-11-10", "2026-09-14"]);
    expect(recentChanges(log, TODAY, 30, "held").map((e) => e.date)).toEqual(["2026-11-10"]);
    expect(recentChanges(log, TODAY, 60, "nobody")).toEqual([]);
  });

  it("the card chip shows the latest change in the last 30 days", () => {
    expect(cardChangedChip(log, "held", TODAY)).toBe("CHANGED NOV 10");
    expect(cardChangedChip(log, "held", "2026-12-15")).toBeNull();
    expect(cardChangedChip(log, "untouched", TODAY)).toBeNull();
    expect(cardChangedChip(log, null, TODAY)).toBeNull();
    expect(cardChangedChip([change({ date: "2026-12-30" })], "held", "2027-01-05")).toBe("CHANGED DEC 30 2026");
  });

  it("one line per change, with the start date only while it is in the future", () => {
    expect(changeLine(change(), { name: "Demo Card" }, TODAY)).toBe("Demo Card · Dining credit · $5/mo → $10/mo");
    expect(changeLine(change({ effective: "2027-01-01" }), { name: "Demo Card" }, TODAY)).toBe("Demo Card · Dining credit · $5/mo → $10/mo · from Jan 1");
    expect(changeLine(change({ effective: "2026-11-01" }), { name: "Demo Card" }, TODAY)).toBe("Demo Card · Dining credit · $5/mo → $10/mo");
    expect(changeLine(change({ from: null, to: 75000 }), undefined, TODAY)).toBe("held · Dining credit · none → 75,000");
    // Dollar amounts and yes/no read as such.
    expect(changeLine(change({ path: "annual_fee.amount", label: "Annual fee", from: 695, to: 895 }), { name: "Demo Card" }, TODAY)).toBe("Demo Card · Annual fee · $695 → $895");
    expect(changeLine(change({ path: "annual_fee.first_year_waived", label: "Annual fee waived the first year", from: false, to: true }), { name: "Demo Card" }, TODAY)).toBe(
      "Demo Card · Annual fee waived the first year · no → yes",
    );
  });

  it("the report link is a prefilled GitHub issue labelled refresh", () => {
    const url = new URL(reportUrl(change(), { name: "Demo Card" }));
    expect(url.origin + url.pathname).toBe("https://github.com/Viraj27/CC-Tracker/issues/new");
    expect(url.searchParams.get("labels")).toBe("refresh");
    expect(url.searchParams.get("title")).toBe("Refresh: Demo Card · Dining credit looks wrong");
    const body = url.searchParams.get("body")!;
    expect(body).toContain("Card: held");
    expect(body).toContain("Path: benefits.dining.amount");
    expect(body).toContain("Source: https://example.com/terms");
  });

  it("earlier public offers feed Find a card's Elevated badge", () => {
    const offers = [50000, 60000, 60000].map((from, i) => change({ date: `2026-0${i + 1}-01`, card_id: "cand", path: "public_offer.bonus", label: "Public offer", from, to: 80000 }));
    const history = offerHistory([...offers, change({ card_id: "cand", path: "benefits.x.amount", from: 1, to: 2 }), change({ card_id: "cand", path: "public_offer.bonus", from: null, to: 80000 })]);
    expect(history).toEqual({ cand: [50000, 60000, 60000] });
    const prov = { source_url: "https://example.com/offer", last_verified: "2026-11-01", verified: false, note: "test" };
    const cat = catalog({ cards: [card({ id: "cand", public_offer: { bonus: 80000, unit: "points", min_spend: 4000, months: 3, as_of: "2026-11-01", ...prov } } as never)] });
    const run = (h: Record<string, number[]>) => findCards(cat, userData({ settings: { ...DEFAULT_SETTINGS, spendProfile: { other: 2000 } } }), criteriaOf({}), TODAY, h).ranked.find((r) => r.card.id === "cand")?.elevated;
    expect(run(history)).toBe(true);
    expect(run({})).toBe(false);
  });
});

describe("the run guard", () => {
  const base = [change({ date: "2026-11-01" })];
  const more = (n: number, over: Partial<ChangelogEntry> = {}) => Array.from({ length: n }, (_, i) => change({ date: "2026-11-13", path: `benefits.b${i}.amount`, ...over }));

  it("only catalog files and a few facts: merges itself", () => {
    const r = guardRun(["catalog/cards/held.yaml", "catalog/feed/changelog.json", "catalog/feed/deals.json"], base, [...base, ...more(3)]);
    expect(r).toMatchObject({ decision: "auto", reasons: [], outside: [] });
    expect(r.added).toHaveLength(3);
  });

  it("a run that changes nothing but the feed is auto", () => {
    expect(guardRun(["catalog/feed/deals.json", "catalog/feed/meta.json"], base, base).decision).toBe("auto");
  });

  it("anything outside catalog/ is rejected", () => {
    const r = guardRun(["catalog/feed/deals.json", "src/app/page.tsx", ".github/workflows/ci.yml", "catalogue/x"], base, base);
    expect(r.decision).toBe("reject");
    expect(r.outside).toEqual(["src/app/page.tsx", ".github/workflows/ci.yml", "catalogue/x"]);
  });

  it("more than 10 changed facts needs the owner; public offers do not count towards the 10", () => {
    expect(guardRun(["catalog/feed/changelog.json"], base, [...base, ...more(10)]).decision).toBe("auto");
    const eleven = guardRun(["catalog/feed/changelog.json"], base, [...base, ...more(11)]);
    expect(eleven.decision).toBe("needs-owner");
    expect(eleven.reasons[0]).toMatch(/11 catalog facts changed/);
    const offers = Array.from({ length: 12 }, (_, i) => change({ date: "2026-11-13", card_id: `c${i}`, path: "public_offer.bonus", from: 1, to: 2 }));
    expect(guardRun(["catalog/feed/changelog.json"], base, [...base, ...more(10), ...offers]).decision).toBe("auto");
  });

  it("any annual fee change needs the owner", () => {
    const r = guardRun(["catalog/cards/held.yaml"], base, [...base, change({ date: "2026-11-13", path: "annual_fee.amount", label: "Annual fee", from: 95, to: 150 })]);
    expect(r.decision).toBe("needs-owner");
    expect(r.annualFeeChanges).toHaveLength(1);
    expect(r.reasons).toEqual(["annual fee changed for held"]);
  });

  it("history may not be removed or rewritten", () => {
    expect(guardRun(["catalog/feed/changelog.json"], base, []).reasons[0]).toMatch(/1 earlier changelog entry was removed or rewritten/);
    const rewritten = guardRun(["catalog/feed/changelog.json"], base, [{ ...base[0], to: "$50/mo" }]);
    expect(rewritten.decision).toBe("needs-owner");
  });

  it("names benefit ids, and whole cards, that went missing", () => {
    const before = [{ id: "a", benefits: [{ id: "x" }, { id: "y" }] }, { id: "b", benefits: [{ id: "z" }] }];
    expect(missingBenefitIds(before, before)).toEqual([]);
    expect(missingBenefitIds(before, [{ id: "a", benefits: [{ id: "x" }, { id: "new" }] }, { id: "c", benefits: [] }])).toEqual(["a: y", "b (the whole card)"]);
  });
});

describe("settings: dismissed deals and the last feed seen", () => {
  it("round-trip through export and import; older files get the defaults", () => {
    expect(DEFAULT_SETTINGS.dismissedDeals).toEqual([]);
    expect(DEFAULT_SETTINGS.dealsSeenAt).toBeNull();
    const d = userData({ settings: { ...DEFAULT_SETTINGS, dismissedDeals: ["a", "b"], dealsSeenAt: "2026-11-13T06:00:00Z" } });
    const again = parseImport(JSON.parse(JSON.stringify(buildExport(d, "2026-11-13T00:00:00.000Z")))).data;
    expect(again.settings.dismissedDeals).toEqual(["a", "b"]);
    expect(again.settings.dealsSeenAt).toBe("2026-11-13"); // the date only
    const old = parseImport({ settings: { afLeadDays: 30 } }).data;
    expect(old.settings.dismissedDeals).toEqual([]);
    expect(old.settings.dealsSeenAt).toBeNull();
  });
});

// The two scripts CI runs, against a throwaway git repository (invented card, nothing from this repo's history).
describe("catalog:check and the path guard, as CI runs them", () => {
  const root = process.cwd();
  const tsx = path.join(root, "node_modules", ".bin", "tsx");
  const cardYaml = (benefits: string) => `id: demo-card
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
benefits:
${benefits}`;
  const benefitLine = (id: string) => `  - { id: ${id}, kind: other, name: ${id}, description: ${id}, cycle: none, source_url: https://example.com, last_verified: 2026-01-01, verified: true }\n`;

  function repo(): { dir: string; write: (file: string, text: string) => void; run: (script: string, ...args: string[]) => { status: number | null; out: string } } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
    const write = (file: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });
    write("catalog/programs.yaml", "programs:\n  - { id: p, name: P, kind: cash, default_cents_per_point: 1 }\n");
    write("catalog/cards/demo-card.yaml", cardYaml(benefitLine("lounge") + benefitLine("dining")));
    write("catalog/feed/changelog.json", "[]\n");
    write("catalog/feed/deals.json", "[]\n");
    write("src/app.ts", "export {};\n");
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const run = (script: string, ...args: string[]) => {
      const env = { ...process.env, CATALOG_DIR: path.join(dir, "catalog") };
      const r = spawnSync(tsx, [path.join(root, "scripts", script), ...args], { cwd: dir, env, encoding: "utf8" });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    return { dir, write, run };
  }

  it("catalog:check passes on the base and fails when a benefit id from the base is missing", () => {
    const r = repo();
    const ok = r.run("catalog-check.ts", "--base", "HEAD");
    expect(ok.out).toContain("no benefit id from HEAD is missing");
    expect(ok.status).toBe(0);
    // Renaming counts as removing: logged usage points at the old id.
    r.write("catalog/cards/demo-card.yaml", cardYaml(benefitLine("lounge") + benefitLine("dining-v2")));
    const bad = r.run("catalog-check.ts", "--base", "HEAD");
    expect(bad.status).toBe(1);
    expect(bad.out).toContain("demo-card: dining");
    // Without --base the same tree is a valid catalog.
    expect(r.run("catalog-check.ts").status).toBe(0);
  }, 60_000);

  it("catalog:check fails on a feed file outside the schema", () => {
    const r = repo();
    r.write("catalog/feed/deals.json", JSON.stringify([{ id: "a", kind: "shopping" }]));
    const bad = r.run("catalog-check.ts");
    expect(bad.status).toBe(1);
    expect(bad.out).toContain("feed validation failed");
  }, 60_000);

  it("the path guard passes a catalog-only change and fails one that touches src/", () => {
    const r = repo();
    r.write("catalog/feed/deals.json", `${JSON.stringify([deal({ id: "a" })])}\n`);
    r.write("catalog/feed/meta.json", `${JSON.stringify({ ran_at: "2026-11-13T06:00:00Z", items_seen: 1, status: "ok" })}\n`);
    const ok = r.run("refresh-guard.ts", "--base", "HEAD", "--paths-only");
    expect(ok.out).toContain("paths OK");
    expect(ok.status).toBe(0);
    expect(r.run("refresh-guard.ts", "--base", "HEAD").out).toContain("decision=auto");

    r.write("src/app.ts", "export const sneaky = true;\n");
    const bad = r.run("refresh-guard.ts", "--base", "HEAD", "--paths-only");
    expect(bad.status).toBe(1);
    expect(bad.out).toContain("touches files outside catalog/: src/app.ts");
    const full = r.run("refresh-guard.ts", "--base", "HEAD");
    expect(full.status).toBe(1);
    expect(full.out).toContain("decision=reject");
  }, 60_000);

  it("the guard asks for the owner when the annual fee changed", () => {
    const r = repo();
    r.write("catalog/feed/changelog.json", `${JSON.stringify([change({ card_id: "demo-card", path: "annual_fee.amount", label: "Annual fee", from: 0, to: 95 })])}\n`);
    const out = r.run("refresh-guard.ts", "--base", "HEAD");
    expect(out.status).toBe(0);
    expect(out.out).toContain("decision=needs-owner");
  }, 60_000);
});
