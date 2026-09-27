-- Enforce at most one "correct" image per ImageSet at the database level.
-- Previously nothing prevented zero or multiple is_correct = true rows in a
-- single image set — round resolution picks correctImageId from whichever
-- isCorrect row comes first, so a duplicate made some rounds unwinnable or
-- ambiguous with no error raised anywhere. Application code (seeding/admin)
-- remains responsible for ensuring *at least* one correct image exists; this
-- partial unique index enforces *at most* one.
CREATE UNIQUE INDEX "game_images_one_correct_per_set"
  ON "game_images"("image_set_id")
  WHERE is_correct = true;
