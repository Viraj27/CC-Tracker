import { describe, expect, it } from "vitest";
import { countedAccounts, fiveTwentyFourStatus, type XInYParams } from "@/lib/domain/fiveTwentyFour";
import { card, catalog, holding } from "./fixtures";

const cat = catalog({
  cards: [
    card({ id: "demo-personal" }),
    card({ id: "demo-business", account_type: "business" }),
    card({ id: "demo-reports-biz", account_type: "business", issuer: "reportingbank" }),
  ],
});

const params: XInYParams = {
  type: "x_in_y",
  max_new_accounts: 4,
  window_months: 24,
  counted_account_types: ["personal"],
  business_counted_issuers: ["reportingbank"],
  counted_issuers: null,
};

describe("5/24", () => {
  const today = "2026-10-16";

  it("counts personal cards opened in the last 24 months, including closed ones", () => {
    const holdings = [
      holding({ id: "a", catalogCardId: "demo-personal", approvalDate: "2024-10-17" }), // counts, drops 2026-10-17
      holding({ id: "b", catalogCardId: "demo-personal", approvalDate: "2024-10-16" }), // drops today → not counted
      holding({ id: "c", catalogCardId: "demo-personal", approvalDate: "2026-01-05", status: "closed" }),
      holding({ id: "d", catalogCardId: "demo-business", approvalDate: "2026-02-01" }), // business: no
      holding({ id: "e", catalogCardId: "demo-reports-biz", approvalDate: "2026-03-01" }), // reports to personal
      holding({ id: "f", nickname: "Demo store card", approvalDate: "2025-12-24" }), // non-catalog personal
      holding({ id: "g", catalogCardId: "demo-personal", approvalDate: "2026-11-01" }), // future: ignore
    ];
    const accounts = countedAccounts(holdings, cat, today, params);
    expect(accounts.map((a) => a.holdingId)).toEqual(["a", "f", "c", "e"]);
    expect(accounts[0].dropOffDate).toBe("2026-10-17");
  });

  it("does not double-count product changes", () => {
    const holdings = [
      holding({ id: "orig", catalogCardId: "demo-personal", approvalDate: "2025-05-01", status: "product_changed" }),
      holding({ id: "pc", catalogCardId: "demo-personal", approvalDate: "2025-05-01", productChangedFromId: "orig" }),
    ];
    expect(countedAccounts(holdings, cat, today, params)).toHaveLength(1);
  });

  it("explicit accountType on a holding overrides the catalog", () => {
    const h = holding({ id: "x", catalogCardId: "demo-business", accountType: "personal", approvalDate: "2026-01-01" });
    expect(countedAccounts([h], cat, today, params)).toHaveLength(1);
  });

  it("reports count, next drop-off and a timeline", () => {
    const holdings = ["2024-12-31", "2025-02-28", "2025-02-28", "2025-08-31", "2026-06-01"].map((d, i) =>
      holding({ id: `h${i}`, catalogCardId: "demo-personal", approvalDate: d }),
    );
    const s = fiveTwentyFourStatus(holdings, cat, today, params);
    expect(s.count).toBe(5);
    expect(s.underLimit).toBe(false);
    expect(s.nextDropOff?.dropOffDate).toBe("2026-12-31");
    expect(s.timeline).toEqual([
      { date: today, count: 5 },
      { date: "2026-12-31", count: 4 },
      { date: "2027-02-28", count: 2 },
      { date: "2027-08-31", count: 1 },
      { date: "2028-06-01", count: 0 },
    ]);
  });

  it("drop-off clamps Feb 29 approvals", () => {
    const h = holding({ id: "leap", catalogCardId: "demo-personal", approvalDate: "2024-02-29" });
    expect(countedAccounts([h], cat, "2025-01-01", params)[0].dropOffDate).toBe("2026-02-28");
  });

  it("supports day-based windows and issuer filters", () => {
    const p: XInYParams = { ...params, window_months: undefined, window_days: 90, counted_issuers: ["testbank"] };
    const holdings = [
      holding({ id: "a", catalogCardId: "demo-personal", approvalDate: "2026-08-01" }),
      holding({ id: "b", catalogCardId: "demo-personal", approvalDate: "2026-07-01" }),
      holding({ id: "c", nickname: "Other bank demo", issuer: "otherbank", approvalDate: "2026-09-01" }),
    ];
    const res = countedAccounts(holdings, cat, today, p);
    expect(res.map((a) => [a.holdingId, a.dropOffDate])).toEqual([["a", "2026-10-30"]]);
  });
});
