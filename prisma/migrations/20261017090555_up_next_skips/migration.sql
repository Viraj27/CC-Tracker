-- CreateTable
CREATE TABLE "Dismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "benefitId" TEXT,
    "period" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    CONSTRAINT "Dismissal_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderMute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "benefitId" TEXT,
    "date" TEXT NOT NULL,
    CONSTRAINT "ReminderMute_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Dismissal_holdingId_idx" ON "Dismissal"("holdingId");

-- CreateIndex
CREATE UNIQUE INDEX "Dismissal_profileId_key_key" ON "Dismissal"("profileId", "key");

-- CreateIndex
CREATE INDEX "ReminderMute_holdingId_idx" ON "ReminderMute"("holdingId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderMute_profileId_key_key" ON "ReminderMute"("profileId", "key");
