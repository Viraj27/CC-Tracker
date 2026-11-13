-- Deals (docs/SPEC-v9-daily-refresh.md §4.4): which feed items the owner dismissed, and when the
-- page was last opened. Kept on Settings: deals are not tied to a holding, so the Dismissal table
-- (whose holdingId is required) does not fit, and the list stays small (the feed keeps 30 days).
-- Plain ADD COLUMNs: the same statements run on SQLite and Cloudflare D1.
ALTER TABLE "Settings" ADD COLUMN "dismissedDeals" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Settings" ADD COLUMN "dealsSeenAt" TEXT;
