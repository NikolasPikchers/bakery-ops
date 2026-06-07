-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SheetType" AS ENUM ('pies', 'desserts', 'confectionery_freeform');

-- CreateEnum
CREATE TYPE "PointScope" AS ENUM ('both', 'point1', 'point2');

-- CreateEnum
CREATE TYPE "SheetStatus" AS ENUM ('uploaded', 'recognized', 'needs_review', 'confirmed');

-- CreateEnum
CREATE TYPE "SheetSource" AS ENUM ('telegram', 'web');

-- CreateEnum
CREATE TYPE "UnknownLineStatus" AS ENUM ('pending', 'mapped', 'ignored');

-- CreateTable
CREATE TABLE "Point" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetType" "SheetType" NOT NULL,
    "pointScope" "PointScope" NOT NULL DEFAULT 'both',
    "shelfLifeDays" INTEGER,
    "defaultPrice" DECIMAL(10,2),
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "sheetType" "SheetType" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "dates" DATE[],
    "source" "SheetSource" NOT NULL,
    "uploadedBy" TEXT,
    "status" "SheetStatus" NOT NULL DEFAULT 'uploaded',
    "rawRecognition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "prihod" INTEGER,
    "ostatok" INTEGER,
    "spisanie" INTEGER,
    "soldCalc" INTEGER,
    "sheetId" TEXT,
    "confidence" DOUBLE PRECISION,
    "rawCell" JSONB,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnknownLine" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "date" DATE,
    "rawText" TEXT NOT NULL,
    "parsedNumbers" JSONB,
    "status" "UnknownLineStatus" NOT NULL DEFAULT 'pending',
    "mappedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnknownLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Point_name_key" ON "Point"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_sheetType_key" ON "Product"("name", "sheetType");

-- CreateIndex
CREATE INDEX "Sheet_pointId_sheetType_idx" ON "Sheet"("pointId", "sheetType");

-- CreateIndex
CREATE INDEX "Sheet_imageHash_idx" ON "Sheet"("imageHash");

-- CreateIndex
CREATE INDEX "Movement_date_idx" ON "Movement"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_pointId_productId_date_key" ON "Movement"("pointId", "productId", "date");

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "Point"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "Point"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnknownLine" ADD CONSTRAINT "UnknownLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

