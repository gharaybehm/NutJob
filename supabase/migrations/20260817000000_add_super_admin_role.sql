-- Run this in the Supabase SQL editor.
-- Adds a platform-level 'super_admin' value to the existing user_role enum
-- (public.user_profiles.role). This is separate from the per-farm
-- farm_members.role, which stays scoped to admin/supervisor/worker within
-- a single farm.
--
-- IMPORTANT: this statement is intentionally the only one in this file.
-- Postgres does not allow a newly added enum value to be used in the same
-- transaction it was added in, so any follow-up migration that references
-- 'super_admin' must live in a separate file/transaction.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'super_admin';
