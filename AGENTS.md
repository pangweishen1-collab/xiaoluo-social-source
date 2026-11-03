# Website release records

The user requires EVERY completed update to be recorded, not only deployments. Before ending each change turn, update the pending changelog alongside the implementation.

- Backend article creation and matrix creation/product-list changes write `site_content_updates` in the same D1 batch as the content. Do not duplicate these automatic entries in the static file. The homepage merges `/api/site-updates` with the static release entries.
- Maintain `app/site-updates.json` for website/code release records. Newest releases go first. Preserve existing published records.
- Before deploying this feature for the first time, apply `drizzle/0000_fluffy_grey_gargoyle.sql` to the production D1 database using the established deployment tooling, then deploy the code. The local migration has no effect on production. Never recreate or alter this table in request handlers.
- During local work, add or revise a `draft` record with `date: null`. Describe only completed changes. Use exactly these types: 网站调整 (UI, layout, navigation, interactions, technical fixes), 行业文章 (article additions, edits, removals or corrections), 矩阵产品 (company/product entries, ownership or operating-status data changes). Matrix UI or article-list layout changes belong to 网站调整, not content categories. Do not fabricate entries to populate an empty category. Draft records are visible only in development.
- Before a user-authorized release, review all changes since the last deployed version, consolidate the draft, set a unique version label and the actual intended release date (`YYYY-MM-DD`, Asia/Shanghai), and set status to `published` in the deployment candidate. Build this exact candidate so the release and record ship together.
- If deployment fails, restore the candidate record to draft; never report it as published. On success, verify the production page and its update record before reporting completion.
- Do not invent older release dates or fill past release history from unverified recollections. When rolling back, align the update data with the code being restored and explain the rollback in the next release record.
- Updating this file or its draft does not authorize deployment. Only deploy when the user explicitly requests it.

This is a required release checklist, not an automatic Cloudflare deployment hook. Releases performed outside this workflow must update the same JSON file.
