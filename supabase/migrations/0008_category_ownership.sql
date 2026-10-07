-- ============================================================
-- A task may only reference a category its own user owns.
--
-- BUILD-PLAN §4 item 12. `tasks_category_id_fkey` was a plain FK to
-- `categories (id)`, and FK checks are not subject to the caller's RLS, so
-- user B could set `category_id` to user A's category. Nothing leaked — RLS
-- still blocks the read — but it was an existence oracle for UUIDs, and user
-- A deleting that category nulled user B's task.
--
-- Done ahead of the MCP server (docs/MCP-PLAN.md §8): a second client that
-- writes `category_id` should meet a database that refuses the wrong one,
-- rather than rely on every caller resolving slugs correctly.
--
-- Checked on live before writing, 6 Oct: zero tasks reference a category
-- owned by another user, so the new constraint validates as it is added.
--
-- `on delete set null (category_id)` needs the column list (Postgres 15+;
-- live is 17.6): a bare `set null` would null `user_id` too, which is
-- `not null` and the row's owner. MATCH SIMPLE, the default, skips the check
-- whenever `category_id` is null, which is every untagged task.
-- ============================================================

alter table public.categories
  add constraint categories_id_user_id_key unique (id, user_id);

alter table public.tasks
  drop constraint tasks_category_id_fkey;

alter table public.tasks
  add constraint tasks_category_owner_fkey
  foreign key (category_id, user_id)
  references public.categories (id, user_id)
  on delete set null (category_id);
