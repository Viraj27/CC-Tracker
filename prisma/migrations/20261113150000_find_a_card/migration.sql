-- Find a card (docs/SPEC-v8-find-a-card.md): the rough spend profile and the page's criteria.
-- Plain ADD COLUMNs: the same statements run on SQLite and Cloudflare D1.
ALTER TABLE "Settings" ADD COLUMN "spendProfile" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Settings" ADD COLUMN "findCardCriteria" TEXT NOT NULL DEFAULT '{}';
