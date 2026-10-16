-- CreateTable
CREATE TABLE "CatalogMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'catalog',
    "hash" TEXT NOT NULL,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CatalogCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "catalogCardId" TEXT,
    "nickname" TEXT,
    "issuer" TEXT,
    "accountType" TEXT,
    "approvalDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedDate" TEXT,
    "productChangedFromId" TEXT,
    "afMonth" INTEGER,
    "afDay" INTEGER,
    "paymentDueDay" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holding_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenefitUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "valueOverride" REAL,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitUsage_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "statementMonth" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" TEXT,
    CONSTRAINT "PaymentRecord_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnnualFeeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "postedDate" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "AnnualFeeEvent_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LifecycleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "offer" TEXT,
    "accepted" BOOLEAN,
    "fromCard" TEXT,
    "toCard" TEXT,
    "details" TEXT,
    CONSTRAINT "LifecycleEvent_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointsBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "balance" REAL NOT NULL,
    "asOf" TEXT NOT NULL,
    "centsPerPoint" REAL,
    CONSTRAINT "PointsBalance_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RotatingActivation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "activated" BOOLEAN NOT NULL DEFAULT true,
    "date" TEXT,
    CONSTRAINT "RotatingActivation_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "profileId" TEXT NOT NULL PRIMARY KEY,
    "afLeadDays" INTEGER NOT NULL DEFAULT 45,
    "creditLeadDays" INTEGER NOT NULL DEFAULT 30,
    "paymentLeadDays" INTEGER NOT NULL DEFAULT 7,
    "perkValueOverrides" TEXT NOT NULL DEFAULT '{}',
    "centsPerPoint" TEXT NOT NULL DEFAULT '{}',
    "paymentTrackingStart" TEXT,
    CONSTRAINT "Settings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Holding_profileId_idx" ON "Holding"("profileId");

-- CreateIndex
CREATE INDEX "BenefitUsage_holdingId_benefitId_periodKey_idx" ON "BenefitUsage"("holdingId", "benefitId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_holdingId_statementMonth_key" ON "PaymentRecord"("holdingId", "statementMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PointsBalance_profileId_program_key" ON "PointsBalance"("profileId", "program");

-- CreateIndex
CREATE UNIQUE INDEX "RotatingActivation_holdingId_quarter_key" ON "RotatingActivation"("holdingId", "quarter");
