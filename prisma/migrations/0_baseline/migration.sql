-- Baseline: the whole schema as of 2026-09-21, in one migration.
--
-- Until this point nothing was ever recorded in _prisma_migrations, and the
-- migration files could not rebuild the schema from zero (several changes had
-- gone in through `db push` or hand-run SQL). Those files are kept, unchanged,
-- in prisma/migrations_archive/ for their comments and history; they are no
-- longer replayed.
--
-- Existing databases (dev, production) already contain everything below: they
-- are marked with `prisma migrate resolve --applied 0_baseline`, which runs
-- none of it. A new, empty database gets the full schema from this file.
--
-- Part 1 is `prisma migrate diff --from-empty --to-schema prisma/schema.prisma`,
-- with Language and MemberType reordered to match production, where values
-- were added by ALTER TYPE … ADD VALUE (Language.AUTRE, MemberType.auditeur).
-- Part 2 is what schema.prisma cannot express; Prisma does not see these
-- objects, so it never creates, alters or drops them — change them only by
-- hand-written SQL in a new migration (`migrate dev --create-only`, then edit).

-- Extensions used by Part 2. Supabase installs them in the `extensions`
-- schema, a local Postgres in `public`; the functions below look in both.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 1 — generated from schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('RETRAIT', 'ENVOI', 'NON_APPLICABLE');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('FRANCAIS', 'ANGLAIS', 'ESPAGNOL', 'ALLEMAND', 'ITALIEN', 'PORTUGAIS', 'ARABE', 'RUSSE', 'CHINOIS', 'AUTRE', 'GREC_ANCIEN', 'GREC_MODERNE', 'LATIN');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'BILLED', 'PAID', 'SOLDE');

-- CreateEnum
CREATE TYPE "BillKind" AS ENUM ('STANDARD', 'PROFORMA');

-- CreateEnum
CREATE TYPE "OrderBillingStatus" AS ENUM ('UNBILLED', 'BILLED', 'UNBILLABLE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('COTISATION', 'ENREGISTREMENT', 'DON', 'DIVERS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CHEQUE', 'ESPECE', 'CB', 'VIREMENT', 'COMPTE_AUXI');

-- CreateEnum
CREATE TYPE "MemberType" AS ENUM ('ecouteur', 'lecteur', 'informaticien', 'administration', 'auditeur', 'bienfaiteur', 'tresoriere');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('member', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "SaveType" AS ENUM ('AUDACITY', 'GARAGEBAND', 'REAPER', 'ADOBE_AUDITION', 'OCENAUDIO', 'WAVEPAD', 'LOGIC_PRO', 'STUDIO_ONE', 'AUTRE');

-- CreateEnum
CREATE TYPE "NewsType" AS ENUM ('GENERAL', 'EVENEMENT', 'ANNONCE', 'ACTUALITE', 'PROGRAMMATION');

-- CreateEnum
CREATE TYPE "BillEventType" AS ENUM ('CREATED', 'ISSUED', 'REOPENED', 'PAID', 'SETTLED', 'AMOUNT_CHANGED', 'ORDER_ATTACHED', 'ORDER_DETACHED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'CLOSED', 'REOPENED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "AssignmentEventType" AS ENUM ('CREATED', 'CLOSED', 'REOPENED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "UserActivityStatus" AS ENUM ('ACTIVE', 'UNAVAILABLE', 'DECEASED', 'RADIATION', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AuditOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "AudioLinkStatus" AS ENUM ('OK', 'FOLDER_EMPTY', 'FOLDER_MISSING', 'NO_PATH', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "AudioTrackAction" AS ENUM ('UPLOAD', 'RENAME', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "TeamSection" AS ENUM ('DIRECTION', 'CONSEIL', 'PERMANENCE');

-- CreateTable
CREATE TABLE "News" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "name" TEXT,
    "memberType" "MemberType" NOT NULL DEFAULT 'auditeur',
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'member',
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordNeedsChange" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "homePhone" TEXT,
    "cellPhone" TEXT,
    "gestconteNotes" TEXT,
    "gestconteId" INTEGER,
    "nonProfitAffiliation" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "activityStatus" "UserActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "activityChangedAt" TIMESTAMP(3),
    "unavailableFrom" TIMESTAMP(3),
    "unavailableUntil" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "terminationReason" TEXT,
    "lastUpdated" TIMESTAMP(3),
    "searchKey" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "preferredDeliveryMethod" "DeliveryMethod",
    "paymentThreshold" DECIMAL(10,2) DEFAULT 21.00,
    "currentBalance" DECIMAL(10,2) DEFAULT 0.00,
    "preferredMediaFormatId" INTEGER,
    "isAvailable" BOOLEAN DEFAULT true,
    "availabilityNotes" TEXT,
    "specialization" TEXT,
    "saveType" "SaveType",
    "maxConcurrentAssignments" INTEGER DEFAULT 3,
    "notes" TEXT,
    "civilityId" INTEGER,
    "civilityOther" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" SERIAL NOT NULL,
    "addressLine1" TEXT,
    "addressSupplement" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "stateProvince" TEXT,
    "country" TEXT NOT NULL DEFAULT 'France',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publishedDate" TIMESTAMP(3),
    "isbn" TEXT,
    "description" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "hiddenFromCatalogue" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addedById" INTEGER NOT NULL,
    "readingDurationMinutes" INTEGER,
    "publisher" TEXT,
    "pageCount" INTEGER,
    "subtitle" TEXT,
    "audio_filepath" TEXT,
    "stock_date" TIMESTAMP(3),
    "last_downloaded_date" TIMESTAMP(3),
    "source_access_id" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "id_arbre" INTEGER,
    "polly_audio_url" TEXT,
    "audioLinkStatus" "AudioLinkStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "audioCheckedAt" TIMESTAMP(3),
    "audioTrackCount" INTEGER,
    "audioSizeKb" INTEGER,
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Civility" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Civility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoupsDeCoeur" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audioPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedById" INTEGER NOT NULL,

    CONSTRAINT "CoupsDeCoeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoupsDeCoeurBooks" (
    "coupsDeCoeurId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,

    CONSTRAINT "CoupsDeCoeurBooks_pkey" PRIMARY KEY ("coupsDeCoeurId","bookId")
);

-- CreateTable
CREATE TABLE "BookGenre" (
    "bookId" INTEGER NOT NULL,
    "genreId" INTEGER NOT NULL,

    CONSTRAINT "BookGenre_pkey" PRIMARY KEY ("bookId","genreId")
);

-- CreateTable
CREATE TABLE "Status" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFormat" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),

    CONSTRAINT "MediaFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "state" "BillingStatus" NOT NULL DEFAULT 'BILLED',
    "creationDate" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "paymentReference" TEXT,
    "invoiceAmount" DECIMAL(10,2) NOT NULL,
    "kind" "BillKind" NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER,
    "type" "PaymentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "creationDate" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "exportDate" TIMESTAMP(3),
    "importDate" TIMESTAMP(3),
    "paymentReference" TEXT,
    "receiptNumber" TEXT,
    "fiscalite" TEXT,
    "cotisationYear" INTEGER,
    "comptable" TEXT,
    "isAllocated" BOOLEAN,
    "allocationDate" TIMESTAMP(3),
    "observations" TEXT,
    "billId" INTEGER,
    "sourceVenteId" INTEGER,
    "sourceEcritureId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orders" (
    "id" SERIAL NOT NULL,
    "aveugleId" INTEGER NOT NULL,
    "catalogueId" INTEGER NOT NULL,
    "requestReceivedDate" TIMESTAMP(3) NOT NULL,
    "statusId" INTEGER NOT NULL,
    "isDuplication" BOOLEAN NOT NULL,
    "mediaFormatId" INTEGER NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "processedByStaffId" INTEGER,
    "createdDate" TIMESTAMP(3),
    "closureDate" TIMESTAMP(3),
    "cost" DECIMAL(10,2),
    "pages" INTEGER,
    "billedPages" INTEGER,
    "pricePerPage" DECIMAL(10,2),
    "transferFee" DECIMAL(10,2),
    "billingStatus" "OrderBillingStatus" NOT NULL DEFAULT 'UNBILLED',
    "billId" INTEGER,
    "lentPhysicalBook" BOOLEAN NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "catalogueId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "receptionDate" TIMESTAMP(3),
    "sentToReaderDate" TIMESTAMP(3),
    "returnedToECADate" TIMESTAMP(3),
    "statusId" INTEGER NOT NULL,
    "notes" TEXT,
    "processedByStaffId" INTEGER,
    "deliveryMethod" "DeliveryMethod",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentReader" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "readerId" INTEGER NOT NULL,
    "assignedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "AssignmentReader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaderLanguage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "language" "Language" NOT NULL,

    CONSTRAINT "ReaderLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillEvent" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "type" "BillEventType" NOT NULL,
    "fromState" "BillingStatus",
    "toState" "BillingStatus",
    "payload" JSONB,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountAtEvent" DECIMAL(10,2),

    CONSTRAINT "BillEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "fromStatusId" INTEGER,
    "toStatusId" INTEGER,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentEvent" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "type" "AssignmentEventType" NOT NULL,
    "fromStatusId" INTEGER,
    "toStatusId" INTEGER,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivityEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromStatus" "UserActivityStatus",
    "toStatus" "UserActivityStatus" NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "unavailableFrom" TIMESTAMP(3),
    "unavailableUntil" TIMESTAMP(3),
    "changedById" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookMergeEvent" (
    "id" SERIAL NOT NULL,
    "canonicalId" INTEGER NOT NULL,
    "duplicateId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookMergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" "AuditOperation" NOT NULL,
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "changes" JSONB NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioFilepathBackup" (
    "bookId" INTEGER NOT NULL,
    "oldPath" TEXT NOT NULL,
    "newPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioFilepathBackup_pkey" PRIMARY KEY ("bookId")
);

-- CreateTable
CREATE TABLE "OrphanAudioFolder" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER,
    "folderNum" INTEGER,
    "title" TEXT NOT NULL,
    "trackCount" INTEGER NOT NULL,
    "bytes" BIGINT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "linkedBookId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "OrphanAudioFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedAudioTrack" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "originalKey" TEXT NOT NULL,
    "trashKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedById" INTEGER,
    "restoredAt" TIMESTAMP(3),
    "restoredById" INTEGER,
    "purgedAt" TIMESTAMP(3),
    "retainForever" BOOLEAN NOT NULL DEFAULT false,
    "originBookId" INTEGER,
    "originBookTitle" TEXT,

    CONSTRAINT "DeletedAudioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioTrackEvent" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "action" "AudioTrackAction" NOT NULL,
    "filename" TEXT NOT NULL,
    "newFilename" TEXT,
    "sizeBytes" BIGINT,
    "durationSeconds" INTEGER,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTrackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioTrackDuration" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "exact" BOOLEAN NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTrackDuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteContact" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "orgName" TEXT NOT NULL,
    "orgSubtitle" TEXT,
    "addressLines" TEXT NOT NULL,
    "phones" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hoursText" TEXT NOT NULL,
    "metroText" TEXT,
    "busText" TEXT,
    "visitText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "section" "TeamSection" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEvent" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalInfo" (
    "id" SERIAL NOT NULL,
    "iconKey" TEXT NOT NULL,
    "colorTheme" TEXT NOT NULL DEFAULT 'blue',
    "question" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticalInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipOption" (
    "id" SERIAL NOT NULL,
    "iconKey" TEXT NOT NULL,
    "colorTheme" TEXT NOT NULL DEFAULT 'blue',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "highlightLabel" TEXT,
    "highlightValue" TEXT,
    "bullets" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Book_audioLinkStatus_idx" ON "Book"("audioLinkStatus");

-- CreateIndex
CREATE INDEX "Book_createdAt_idx" ON "Book"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Book_title_idx" ON "Book"("title");

-- CreateIndex
CREATE INDEX "Book_author_idx" ON "Book"("author");

-- CreateIndex
CREATE INDEX "Book_isbn_idx" ON "Book"("isbn");

-- CreateIndex
CREATE INDEX "Book_available_idx" ON "Book"("available");

-- CreateIndex
CREATE INDEX "Book_deletedAt_idx" ON "Book"("deletedAt");

-- CreateIndex
CREATE INDEX "Book_addedById_createdAt_idx" ON "Book"("addedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE INDEX "Genre_name_idx" ON "Genre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Civility_name_key" ON "Civility"("name");

-- CreateIndex
CREATE INDEX "Civility_name_idx" ON "Civility"("name");

-- CreateIndex
CREATE INDEX "BookGenre_bookId_idx" ON "BookGenre"("bookId");

-- CreateIndex
CREATE INDEX "BookGenre_genreId_idx" ON "BookGenre"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "Status_name_key" ON "Status"("name");

-- CreateIndex
CREATE INDEX "Status_name_idx" ON "Status"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFormat_name_key" ON "MediaFormat"("name");

-- CreateIndex
CREATE INDEX "MediaFormat_name_idx" ON "MediaFormat"("name");

-- CreateIndex
CREATE INDEX "Bill_clientId_idx" ON "Bill"("clientId");

-- CreateIndex
CREATE INDEX "Bill_kind_idx" ON "Bill"("kind");

-- CreateIndex
CREATE INDEX "Bill_state_idx" ON "Bill"("state");

-- CreateIndex
CREATE INDEX "Bill_creationDate_idx" ON "Bill"("creationDate");

-- CreateIndex
CREATE INDEX "Bill_isActive_idx" ON "Bill"("isActive");

-- CreateIndex
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");

-- CreateIndex
CREATE INDEX "Payment_type_idx" ON "Payment"("type");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE INDEX "Payment_creationDate_idx" ON "Payment"("creationDate");

-- CreateIndex
CREATE INDEX "Payment_cotisationYear_idx" ON "Payment"("cotisationYear");

-- CreateIndex
CREATE INDEX "Payment_isActive_idx" ON "Payment"("isActive");

-- CreateIndex
CREATE INDEX "Orders_aveugleId_idx" ON "Orders"("aveugleId");

-- CreateIndex
CREATE INDEX "Orders_catalogueId_idx" ON "Orders"("catalogueId");

-- CreateIndex
CREATE INDEX "Orders_statusId_idx" ON "Orders"("statusId");

-- CreateIndex
CREATE INDEX "Orders_billingStatus_idx" ON "Orders"("billingStatus");

-- CreateIndex
CREATE INDEX "Orders_mediaFormatId_idx" ON "Orders"("mediaFormatId");

-- CreateIndex
CREATE INDEX "Orders_billId_idx" ON "Orders"("billId");

-- CreateIndex
CREATE INDEX "Orders_isActive_idx" ON "Orders"("isActive");

-- CreateIndex
CREATE INDEX "Orders_processedByStaffId_createdDate_idx" ON "Orders"("processedByStaffId", "createdDate");

-- CreateIndex
CREATE INDEX "Assignment_catalogueId_idx" ON "Assignment"("catalogueId");

-- CreateIndex
CREATE INDEX "Assignment_orderId_idx" ON "Assignment"("orderId");

-- CreateIndex
CREATE INDEX "Assignment_statusId_idx" ON "Assignment"("statusId");

-- CreateIndex
CREATE INDEX "Assignment_sentToReaderDate_idx" ON "Assignment"("sentToReaderDate");

-- CreateIndex
CREATE INDEX "Assignment_returnedToECADate_idx" ON "Assignment"("returnedToECADate");

-- CreateIndex
CREATE INDEX "Assignment_deletedAt_idx" ON "Assignment"("deletedAt");

-- CreateIndex
CREATE INDEX "AssignmentReader_assignmentId_idx" ON "AssignmentReader"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentReader_readerId_idx" ON "AssignmentReader"("readerId");

-- CreateIndex
CREATE INDEX "AssignmentReader_assignedDate_idx" ON "AssignmentReader"("assignedDate");

-- CreateIndex
CREATE INDEX "ReaderLanguage_userId_idx" ON "ReaderLanguage"("userId");

-- CreateIndex
CREATE INDEX "ReaderLanguage_language_idx" ON "ReaderLanguage"("language");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderLanguage_userId_language_key" ON "ReaderLanguage"("userId", "language");

-- CreateIndex
CREATE INDEX "BillEvent_billId_idx" ON "BillEvent"("billId");

-- CreateIndex
CREATE INDEX "BillEvent_createdAt_idx" ON "BillEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BillEvent_performedById_createdAt_idx" ON "BillEvent"("performedById", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_createdAt_idx" ON "OrderEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_performedById_createdAt_idx" ON "OrderEvent"("performedById", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentEvent_assignmentId_idx" ON "AssignmentEvent"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentEvent_createdAt_idx" ON "AssignmentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AssignmentEvent_performedById_createdAt_idx" ON "AssignmentEvent"("performedById", "createdAt");

-- CreateIndex
CREATE INDEX "UserActivityEvent_userId_idx" ON "UserActivityEvent"("userId");

-- CreateIndex
CREATE INDEX "UserActivityEvent_changedAt_idx" ON "UserActivityEvent"("changedAt");

-- CreateIndex
CREATE INDEX "BookMergeEvent_canonicalId_idx" ON "BookMergeEvent"("canonicalId");

-- CreateIndex
CREATE INDEX "BookMergeEvent_duplicateId_idx" ON "BookMergeEvent"("duplicateId");

-- CreateIndex
CREATE INDEX "BookMergeEvent_createdAt_idx" ON "BookMergeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_model_recordId_idx" ON "AuditEvent"("model", "recordId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrphanAudioFolder_prefix_key" ON "OrphanAudioFolder"("prefix");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_folderNum_idx" ON "OrphanAudioFolder"("folderNum");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_year_idx" ON "OrphanAudioFolder"("year");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_dismissedAt_idx" ON "OrphanAudioFolder"("dismissedAt");

-- CreateIndex
CREATE INDEX "OrphanAudioFolder_resolvedAt_idx" ON "OrphanAudioFolder"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletedAudioTrack_trashKey_key" ON "DeletedAudioTrack"("trashKey");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_bookId_idx" ON "DeletedAudioTrack"("bookId");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_deletedAt_idx" ON "DeletedAudioTrack"("deletedAt");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_restoredAt_idx" ON "DeletedAudioTrack"("restoredAt");

-- CreateIndex
CREATE INDEX "DeletedAudioTrack_purgedAt_idx" ON "DeletedAudioTrack"("purgedAt");

-- CreateIndex
CREATE INDEX "AudioTrackEvent_bookId_idx" ON "AudioTrackEvent"("bookId");

-- CreateIndex
CREATE INDEX "AudioTrackEvent_createdAt_idx" ON "AudioTrackEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AudioTrackDuration_bookId_idx" ON "AudioTrackDuration"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioTrackDuration_bookId_filename_key" ON "AudioTrackDuration"("bookId", "filename");

-- CreateIndex
CREATE INDEX "TeamMember_section_sortOrder_idx" ON "TeamMember"("section", "sortOrder");

-- CreateIndex
CREATE INDEX "HistoryEvent_year_idx" ON "HistoryEvent"("year");

-- CreateIndex
CREATE INDEX "PracticalInfo_sortOrder_idx" ON "PracticalInfo"("sortOrder");

-- CreateIndex
CREATE INDEX "MembershipOption_sortOrder_idx" ON "MembershipOption"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_preferredMediaFormatId_fkey" FOREIGN KEY ("preferredMediaFormatId") REFERENCES "MediaFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_civilityId_fkey" FOREIGN KEY ("civilityId") REFERENCES "Civility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeur" ADD CONSTRAINT "CoupsDeCoeur_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeurBooks" ADD CONSTRAINT "CoupsDeCoeurBooks_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupsDeCoeurBooks" ADD CONSTRAINT "CoupsDeCoeurBooks_coupsDeCoeurId_fkey" FOREIGN KEY ("coupsDeCoeurId") REFERENCES "CoupsDeCoeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookGenre" ADD CONSTRAINT "BookGenre_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookGenre" ADD CONSTRAINT "BookGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_aveugleId_fkey" FOREIGN KEY ("aveugleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_mediaFormatId_fkey" FOREIGN KEY ("mediaFormatId") REFERENCES "MediaFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentReader" ADD CONSTRAINT "AssignmentReader_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentReader" ADD CONSTRAINT "AssignmentReader_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderLanguage" ADD CONSTRAINT "ReaderLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityEvent" ADD CONSTRAINT "UserActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityEvent" ADD CONSTRAINT "UserActivityEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookMergeEvent" ADD CONSTRAINT "BookMergeEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrphanAudioFolder" ADD CONSTRAINT "OrphanAudioFolder_linkedBookId_fkey" FOREIGN KEY ("linkedBookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedAudioTrack" ADD CONSTRAINT "DeletedAudioTrack_restoredById_fkey" FOREIGN KEY ("restoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTrackEvent" ADD CONSTRAINT "AudioTrackEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTrackEvent" ADD CONSTRAINT "AudioTrackEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTrackDuration" ADD CONSTRAINT "AudioTrackDuration_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 2 — objects schema.prisma cannot express
-- ═══════════════════════════════════════════════════════════════════════════

-- Book.isbn is unique among live books only: a soft-deleted book must not hold
-- its ISBN hostage from a future, unrelated one. See the comment on Book.isbn
-- in schema.prisma (from migrations_archive/20260915225033_book_soft_delete).
CREATE UNIQUE INDEX "Book_isbn_key" ON "Book"("isbn") WHERE "deletedAt" IS NULL;

-- A demande marked BILLED must point at its facture.
ALTER TABLE "Orders" ADD CONSTRAINT "orders_billed_requires_bill"
    CHECK ("billId" IS NOT NULL OR "billingStatus" <> 'BILLED'::"OrderBillingStatus");

-- Idle transactions from the app role are killed after 30 s, so one abandoned
-- session cannot starve pgbouncer's pool (migrations_archive/manual/
-- 20260910120000_role_idle_in_transaction_timeout.sql). Role-level on purpose:
-- pgbouncer's transaction mode would not keep a per-session SET attached.
ALTER ROLE "postgres" SET idle_in_transaction_session_timeout = '30s';

-- Accent-insensitive search. unaccent() is only STABLE, so it is wrapped to be
-- usable where IMMUTABLE is required; search_path is pinned because Supabase
-- keeps extensions outside `public`
-- (migrations_archive/manual/20260916120000_fix_immutable_unaccent_search_path.sql).
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$ SELECT unaccent('unaccent', $1) $function$;

-- Accent-insensitive catalogue search (raw SQL in lib/books/bookList.ts):
-- expression indexes on the folded columns, trigram and full-text indexes on
-- the description. Created by hand on production before the history was kept;
-- Prisma cannot express any of them.
CREATE INDEX idx_book_title_unaccent ON "Book" USING btree (lower(immutable_unaccent(title)));
CREATE INDEX idx_book_author_unaccent ON "Book" USING btree (lower(immutable_unaccent(author)));
CREATE INDEX idx_book_subtitle_unaccent ON "Book" USING btree (lower(immutable_unaccent(subtitle))) WHERE (subtitle IS NOT NULL);
CREATE INDEX idx_book_publisher_unaccent ON "Book" USING btree (lower(immutable_unaccent(publisher))) WHERE (publisher IS NOT NULL);
CREATE INDEX idx_book_description_gin ON "Book" USING gin (description gin_trgm_ops) WHERE (description IS NOT NULL);
CREATE INDEX idx_book_description_fts ON "Book" USING gin (to_tsvector('french'::regconfig, description)) WHERE (description IS NOT NULL);
CREATE INDEX idx_genre_name_unaccent ON "Genre" USING btree (lower(immutable_unaccent(name)));

-- The fold shared by User."searchKey", search_vocabulary and the query side.
-- Must agree character for character with foldForSearchKey
-- (lib/search-normalize.ts); scripts/search-fold.e2e.ts checks it. The three
-- trailing letters are translated before unaccent because Postgres versions
-- disagree on them (migrations_archive/manual/20260917100000_search_fold_version_proof.sql).
CREATE OR REPLACE FUNCTION public.search_fold(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$
    SELECT btrim(regexp_replace(
        lower(immutable_unaccent(translate(
            $1,
            -- 8 apostrophes, 7 dashes, 5 quotes, 19 spaces, 3 letters unaccent
            -- folds differently from one Postgres version to the next
            U&'\2018\2019\201B\02BC\02B9\2032\00B4`'
                || U&'\2010\2011\2012\2013\2014\2015\2212'
                || U&'\201C\201D\201E\00AB\00BB'
                || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
                || U&'\00AA\00BA\00B5',
            repeat('''', 8) || repeat('-', 7) || repeat('"', 5) || repeat(' ', 19)
                || U&'ao\03BC'
        ))),
        '[[:space:]]+', ' ', 'g'
    ))
$function$;

-- User."searchKey" is kept up to date by a trigger rather than a GENERATED
-- column, because Prisma writes the field back on updates. If the fold fails
-- the key degrades to lower-case instead of blocking the write
-- (migrations_archive/manual/20260916150000_user_search_key.sql).
CREATE OR REPLACE FUNCTION public.user_search_key_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
DECLARE
    source text := concat_ws(' ', NEW."firstName", NEW."lastName", NEW.name, NEW.email);
BEGIN
    BEGIN
        NEW."searchKey" := search_fold(source);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'search_fold a échoué pour User %, clé non dés-accentuée : %', NEW.id, SQLERRM;
        NEW."searchKey" := btrim(regexp_replace(lower(source), '[[:space:]]+', ' ', 'g'));
    END;
    RETURN NEW;
END
$function$;

CREATE TRIGGER user_search_key
    BEFORE INSERT OR UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION public.user_search_key_trigger();

-- The dictionary behind « Vouliez-vous dire … ? » (lib/search-suggest.ts),
-- refreshed nightly by /api/cron/refresh-search-vocabulary. Changing its
-- definition means DROP MATERIALIZED VIEW then CREATE again
-- (migrations_archive/manual/20260916160000_search_vocabulary.sql).
CREATE MATERIALIZED VIEW search_vocabulary AS
WITH sources (domain, text) AS (
    SELECT 'people', concat_ws(' ', "firstName", "lastName", name)
        FROM "User" WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 'books', concat_ws(' ', title, subtitle, author, publisher)
        FROM "Book" WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 'genres', name FROM "Genre"
    UNION ALL
    SELECT 'news', title FROM "News"
    UNION ALL
    SELECT 'listes', title FROM "CoupsDeCoeur"
    UNION ALL
    SELECT 'orphans', title FROM "OrphanAudioFolder"
    UNION ALL
    SELECT 'trash', concat_ws(' ', "originBookTitle", filename) FROM "DeletedAudioTrack"
),
words AS (
    SELECT domain, w AS word
    FROM sources,
        LATERAL regexp_split_to_table(
            lower(text),
            U&'[[:space:][:punct:]\2018\2019\201B\02BC\00B4\00AB\00BB\201C\201D\201E\2010\2013\2014\2026]+'
        ) AS w
    WHERE length(w) >= 3 AND w ~ '[a-z]|[^[:ascii:]]' AND w !~ '[0-9]'
)
SELECT
    domain,
    search_fold(word) AS fold,
    mode() WITHIN GROUP (ORDER BY word) AS word,
    count(*)::int AS freq
FROM words
GROUP BY domain, search_fold(word);

-- Unique: required by REFRESH … CONCURRENTLY.
CREATE UNIQUE INDEX search_vocabulary_domain_fold ON search_vocabulary (domain, fold);
CREATE INDEX search_vocabulary_fold_trgm ON search_vocabulary USING gin (fold gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.refresh_search_vocabulary()
RETURNS void
LANGUAGE sql
SET search_path = public, extensions
AS $function$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.search_vocabulary $function$;
