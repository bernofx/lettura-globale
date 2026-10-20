-- The production rollout applied these columns before the migration journal
-- was committed. Keep this entry as a no-op so existing databases can record
-- it safely; fresh databases receive the columns in 0004.
SELECT 1;
