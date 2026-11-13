-- Annual fee, after it posts (docs/SPEC-v6.1-annual-fee-decision.md).
-- AnnualFeeEvent.outcome gains the value "pending" (a plain string column: no change needed).
-- Plain ADD COLUMNs: the same statements run on SQLite and Cloudflare D1.
ALTER TABLE "Holding" ADD COLUMN "afRefundDays" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "afWatchDays" INTEGER NOT NULL DEFAULT 45;
