import { describe, expect, it } from "vitest";
import { buildExport, EXPORT_VERSION, ImportError, parseImport } from "@/lib/importExport";

const seed = {
  holdings: [
    {
      catalogCardId: "demo-card",
      approvalDate: "2025-01-15",
      paymentDueDay: 20,
      usages: [{ benefitId: "x", periodKey: "2026", amount: 10, date: "2026-02-01" }],
      payments: [{ statementMonth: "2026-02", dueDate: "2026-02-20", paid: true, paidDate: "2026-02-18" }],
    },
    { nickname: "Demo store card", issuer: "examplebank", approvalDate: "2024-03-01", status: "closed" },
  ],
  points: [{ program: "test-points", balance: 100, asOf: "2026-01-01" }],
};

describe("import", () => {
  it("validates and derives deterministic ids (idempotent re-import)", () => {
    const a = parseImport(seed).data;
    const b = parseImport(JSON.parse(JSON.stringify(seed))).data;
    expect(a.holdings.map((h) => h.id)).toEqual(b.holdings.map((h) => h.id));
    expect(a.usages[0].id).toBe(b.usages[0].id);
    expect(a.usages[0].holdingId).toBe(a.holdings[0].id);
    expect(a.holdings[0]).toMatchObject({ status: "open", afMonth: null, nickname: null });
  });

  it("rejects invalid files with a readable message", () => {
    expect(() => parseImport({ holdings: [{ approvalDate: "2025-01-15" }] })).toThrow(ImportError);
    expect(() => parseImport({ holdings: [{ nickname: "x", approvalDate: "15/01/2025" }] })).toThrow(/approvalDate/);
    expect(() =>
      parseImport({ holdings: [{ nickname: "x", approvalDate: "2025-01-15", productChangedFromId: "missing" }] }),
    ).toThrow(/productChangedFromId/);
  });

  it("export round-trips through import", () => {
    const { data } = parseImport(seed);
    const exported = JSON.parse(JSON.stringify(buildExport(data, "2026-10-16T00:00:00Z")));
    const again = parseImport(exported);
    expect(again.data).toEqual(data);
    expect(again.hasSettings).toBe(true);
  });

  it("round-trips skips and mutes, nested under their holding", () => {
    const withSkips = {
      ...seed,
      holdings: [
        {
          ...seed.holdings[0],
          id: "demo-h1",
          skips: [
            { kind: "rotating", period: "2026-Q4", date: "2026-10-17" },
            { kind: "credit", benefitId: "lyft-credit", period: "2026-10", date: "2026-10-17" },
          ],
          mutes: [
            { kind: "rotating", date: "2026-10-17" },
            { kind: "benefit", benefitId: "lyft-credit", date: "2026-10-17" },
          ],
        },
        seed.holdings[1],
      ],
    };
    const { data } = parseImport(withSkips);
    expect(data.dismissals.map((d) => [d.holdingId, d.kind, d.benefitId, d.period])).toEqual([
      ["demo-h1", "rotating", null, "2026-Q4"],
      ["demo-h1", "credit", "lyft-credit", "2026-10"],
    ]);
    expect(data.mutes.map((m) => [m.holdingId, m.kind, m.benefitId])).toEqual([
      ["demo-h1", "rotating", null],
      ["demo-h1", "benefit", "lyft-credit"],
    ]);
    // Deterministic ids: the same file gives the same rows.
    expect(parseImport(JSON.parse(JSON.stringify(withSkips))).data.dismissals.map((d) => d.id)).toEqual(data.dismissals.map((d) => d.id));

    const exported = JSON.parse(JSON.stringify(buildExport(data, "2026-10-17T00:00:00Z")));
    expect(exported.version).toBe(EXPORT_VERSION);
    expect(exported.version).toBeGreaterThan(1);
    expect(exported.holdings[0].skips).toHaveLength(2);
    expect(exported.holdings[0].skips[0]).not.toHaveProperty("holdingId");
    expect(exported.holdings[1].mutes).toEqual([]);
    expect(parseImport(exported).data).toEqual(data);
  });

  it("imports old (version 1) export files: no skips or mutes", () => {
    const v1 = {
      format: "cc-tracker-export",
      version: 1,
      exportedAt: "2026-10-01T00:00:00Z",
      holdings: [{ id: "demo-old", catalogCardId: "demo-card", approvalDate: "2025-01-15", usages: [], payments: [], afEvents: [], lifecycle: [], activations: [] }],
      points: [],
    };
    const { data } = parseImport(v1);
    expect(data.holdings).toHaveLength(1);
    expect(data.dismissals).toEqual([]);
    expect(data.mutes).toEqual([]);
  });

  it("keeps one skip per occurrence and validates skips and mutes", () => {
    const dup = {
      holdings: [
        {
          nickname: "Demo",
          approvalDate: "2025-01-15",
          skips: [
            { kind: "payment", period: "2026-10", date: "2026-10-17" },
            { kind: "payment", period: "2026-10", date: "2026-10-18" },
          ],
          mutes: [{ kind: "rotating", date: "2026-10-17" }, { kind: "rotating", date: "2026-10-18" }],
        },
      ],
    };
    const { data } = parseImport(dup);
    expect(data.dismissals).toHaveLength(1);
    expect(data.dismissals[0].date).toBe("2026-10-17");
    expect(data.mutes).toHaveLength(1);
    const bad = (h: object) => () => parseImport({ holdings: [{ nickname: "Demo", approvalDate: "2025-01-15", ...h }] });
    expect(bad({ skips: [{ kind: "credit", period: "2026-10", date: "2026-10-17" }] })).toThrow(/benefitId/);
    expect(bad({ skips: [{ kind: "snooze", period: "2026-10", date: "2026-10-17" }] })).toThrow(ImportError);
    expect(bad({ mutes: [{ kind: "benefit", date: "2026-10-17" }] })).toThrow(/benefitId/);
    // Payments and annual fees can't be muted.
    expect(bad({ mutes: [{ kind: "payment", date: "2026-10-17" }] })).toThrow(ImportError);
  });
});
