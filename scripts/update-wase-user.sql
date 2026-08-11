-- Export / Update for user: wase@gmail.com
-- Generated: 2026-07-28
-- Run against database: Etag_workflow

BEGIN;

UPDATE public."user"
SET
    last_login_at = '2026-07-28 08:20:27+03',
    created_at    = '2026-06-08 14:19:32+03',
    created_by    = '670bc243-5754-49b9-843d-ae3a28e26682'
WHERE email = 'wase@gmail.com';

COMMIT;

-- Verification query (run after to confirm):
-- SELECT id, full_name, email, role, is_active, last_login_at, created_at, created_by
-- FROM public."user"
-- WHERE email = 'wase@gmail.com';
