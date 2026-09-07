ALTER TABLE "users"
ADD COLUMN "locationEn" TEXT,
ADD COLUMN "bioEn" TEXT;

ALTER TABLE "properties"
ADD COLUMN "titleEn" TEXT,
ADD COLUMN "descriptionEn" TEXT,
ADD COLUMN "englishAvailable" BOOLEAN NOT NULL DEFAULT false;
