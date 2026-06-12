-- ============================================================
-- Marketing Module Data Reset
-- Run this SQL against your database before starting the server
-- or let the automatic cleanup in app.ts handle it.
-- ============================================================

BEGIN;

DELETE FROM notification
WHERE parent_type IN ('paid_customer_submission', 'customer')
   OR resource_type IN ('payment_submitted', 'clarification_requested', 'clarification_response');

DROP TABLE IF EXISTS paid_customer_review CASCADE;
DROP TABLE IF EXISTS marketing_review CASCADE;
DROP TABLE IF EXISTS marketing_submission CASCADE;
DROP TABLE IF EXISTS paid_customer CASCADE;
DROP TABLE IF EXISTS customer CASCADE;

-- New tables (marketing_task, marketing_submission, marketing_review)
-- will be auto-created by TypeORM on next startup

COMMIT;
