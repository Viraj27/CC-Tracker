import { describe, expect, it } from "vitest";
import { dueDateFor, paymentSchedule } from "@/lib/domain/payments";
import { holding } from "./fixtures";

describe("payment due dates", () => {
  it("uses the due day, clamped to the month length", () => {
    expect(dueDateFor("2026-10", 15)).toBe("2026-10-15");
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2028-02", 30)).toBe("2028-02-29");
    expect(dueDateFor("2026-04", 31)).toBe("2026-04-30");
  });

  it("builds a schedule with paid / past-due / due-soon / upcoming states", () => {
    const h = holding({ id: "h1", approvalDate: "2024-01-01", paymentDueDay: 20 });
    const records = [
      { id: "p1", holdingId: "h1", statementMonth: "2026-08", dueDate: "2026-08-20", paid: true, paidDate: "2026-08-18" },
    ];
    const rows = paymentSchedule(h, records, "2026-10-16", 7);
    expect(rows.map((r) => [r.month, r.dueDate, r.state])).toEqual([
      ["2026-08", "2026-08-20", "paid"],
      ["2026-09", "2026-09-20", "past_due"],
      ["2026-10", "2026-10-20", "due_soon"],
      ["2026-11", "2026-11-20", "upcoming"],
    ]);
    expect(rows[2].daysUntilDue).toBe(4);
  });

  it("does not show months before tracking start or before the account opened", () => {
    const h = holding({ id: "h1", approvalDate: "2026-09-25", paymentDueDay: 10 });
    expect(paymentSchedule(h, [], "2026-10-16", 7).map((r) => r.month)).toEqual(["2026-10", "2026-11"]);
    const old = holding({ id: "h2", approvalDate: "2020-01-01", paymentDueDay: 10 });
    expect(paymentSchedule(old, [], "2026-10-16", 7, "2026-10").map((r) => r.month)).toEqual(["2026-10", "2026-11"]);
  });

  it("closed cards and cards without a due day have no schedule", () => {
    expect(paymentSchedule(holding({ id: "a", paymentDueDay: 5, status: "closed" }), [], "2026-10-16", 7)).toEqual([]);
    expect(paymentSchedule(holding({ id: "b" }), [], "2026-10-16", 7)).toEqual([]);
  });
});
