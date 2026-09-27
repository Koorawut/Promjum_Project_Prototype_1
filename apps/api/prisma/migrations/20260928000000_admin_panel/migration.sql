-- Admin Panel (see admin-panel-functions.md design contract):
-- * users.role for the AdminGuard ('user' | 'admin', all existing rows = 'user')
-- * sentences.text_th — the admin form collects EN + TH separately
-- * sentences.is_enabled — Enable/Disable switch; user-facing queries filter on it
-- * media_files — uploaded image/audio stored in Postgres (Railway FS is ephemeral)
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';

ALTER TABLE "sentences" ADD COLUMN "text_th" TEXT;
ALTER TABLE "sentences" ADD COLUMN "is_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);
