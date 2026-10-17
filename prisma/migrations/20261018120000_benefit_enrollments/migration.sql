-- CreateTable
CREATE TABLE "BenefitEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "enrolledOn" TEXT NOT NULL,
    CONSTRAINT "BenefitEnrollment_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BenefitEnrollment_holdingId_benefitId_idx" ON "BenefitEnrollment"("holdingId", "benefitId");
