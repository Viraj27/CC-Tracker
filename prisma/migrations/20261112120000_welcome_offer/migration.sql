-- CreateTable
CREATE TABLE "WelcomeOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "bonusAmount" REAL NOT NULL,
    "bonusUnit" TEXT NOT NULL,
    "program" TEXT,
    "minSpend" REAL,
    "windowMonths" INTEGER,
    "deadline" TEXT,
    "spentSoFar" REAL,
    "spentAsOf" TEXT,
    "metDate" TEXT,
    "postedDate" TEXT,
    "postedAmount" REAL,
    "outcome" TEXT,
    "note" TEXT,
    CONSTRAINT "WelcomeOffer_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- Plain ADD COLUMNs (not Prisma's table rebuild): the same statements run on SQLite and Cloudflare D1.
ALTER TABLE "Settings" ADD COLUMN "subLeadDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "subPostingDays" INTEGER NOT NULL DEFAULT 56;
ALTER TABLE "Settings" ADD COLUMN "countBonusInRoi" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeOffer_holdingId_key" ON "WelcomeOffer"("holdingId");

