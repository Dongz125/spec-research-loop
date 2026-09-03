ALTER TABLE judge_reviews
ADD COLUMN IF NOT EXISTS evaluation_run_id UUID;

CREATE INDEX IF NOT EXISTS idx_judge_reviews_run
ON judge_reviews (evaluation_run_id);
