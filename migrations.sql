-- ============================================
-- 增量结构变更（迁移脚本存放处）
-- 每次数据库结构调整，把新的 ALTER 语句追加到这个文件末尾
-- 单独在 SQL Editor 里执行，不要跟 database-schema.sql 混在一起跑
--
-- ⚠️ 执行前先去 App 顶部点一下"⬇️ 导出"备份数据！
-- ============================================

-- 2026-08-10：知识树归纳功能，新增层级/难度/前置知识字段
ALTER TABLE knowledge_points
  ADD COLUMN IF NOT EXISTS parent_category TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'intermediate',
  ADD COLUMN IF NOT EXISTS prerequisites TEXT[] DEFAULT '{}';
