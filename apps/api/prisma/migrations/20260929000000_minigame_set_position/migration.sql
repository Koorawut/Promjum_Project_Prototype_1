-- Stable A–D slot order for minigame answer sets. The admin panel's
-- "จัดการมินิเกม" page edits images positionally (slot 0..3 = A..D), so
-- GameImage needs an explicit order column. game_images has no createdAt,
-- so backfill from the only stable ordering available: uuid assignment
-- order approximates insertion order closely enough for seed sets (the
-- in-game board is shuffled at round start anyway — this order only
-- matters for the admin form's slot display).
ALTER TABLE "game_images" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "game_images" gi
SET "position" = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY image_set_id
    ORDER BY id ASC
  ) AS rn
  FROM "game_images"
) sub
WHERE gi.id = sub.id;
