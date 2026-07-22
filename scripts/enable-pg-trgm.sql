-- Enable pg_trgm extension for fuzzy/similarity text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes for fast similarity searches on designer tasks
CREATE INDEX IF NOT EXISTS idx_designer_task_title_trgm ON designer_task USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_designer_task_description_trgm ON designer_task USING GIN (description gin_trgm_ops);

-- Also create indexes for other task types (future-proofing)
CREATE INDEX IF NOT EXISTS idx_marketing_task_title_trgm ON marketing_task USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_marketing_task_description_trgm ON marketing_task USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_dc_task_title_trgm ON data_collector_task USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dc_task_description_trgm ON data_collector_task USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_qs_task_title_trgm ON qs_task USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_qs_task_description_trgm ON qs_task USING GIN (description gin_trgm_ops);
