-- Backfill only persisted publication and latest-edit timestamps.
-- Stable IDs make re-running safe. No article content is modified.
INSERT INTO site_content_updates (id, type, title, detail, created_at)
SELECT 'article-published-' || a.id, '行业文章', '新增文章：' || a.title,
       a.company || '｜历史记录补录，按文章原始发布时间展示。', a.published_at
FROM analysis_articles a
WHERE julianday(a.published_at) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM site_content_updates u
    WHERE u.id = 'article-published-' || a.id
       OR (u.type = '行业文章' AND u.title = '新增文章：' || a.title AND u.created_at = a.published_at)
  );

INSERT INTO site_content_updates (id, type, title, detail, created_at)
SELECT 'article-edited-' || a.id || '-' || a.updated_at, '行业文章', '更新文章：' || a.title,
       a.company || '｜按文章保存的最后修改时间补录；未保留逐次历史版本，不列出具体修改内容。', a.updated_at
FROM analysis_articles a
WHERE julianday(a.updated_at) > julianday(a.published_at)
  AND NOT EXISTS (
    SELECT 1 FROM site_content_updates u
    WHERE u.id = 'article-edited-' || a.id || '-' || a.updated_at
       OR (u.type = '行业文章' AND u.title = '更新文章：' || a.title AND u.created_at = a.updated_at)
  );
