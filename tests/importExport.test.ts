import { describe, expect, it } from "vitest";
import { buildExport, ImportError, parseImport } from "@/lib/importExport";

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
});
