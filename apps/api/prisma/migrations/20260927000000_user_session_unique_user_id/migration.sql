-- Enforce exactly one UserSession row per user at the database level.
-- Previously the "single session per account" invariant was enforced only
-- by application logic (deleteMany then create, non-atomic) — two
-- near-simultaneous logins could both pass the "no existing session" check
-- and both insert, leaving two valid sessions live for one account. See
-- README_ปัญหาและวิธีแก้.md for the race and AuthService.issueSession's
-- upsert, which now relies on this constraint for atomicity.
CREATE UNIQUE INDEX "user_sessions_user_id_key" ON "user_sessions"("user_id");
