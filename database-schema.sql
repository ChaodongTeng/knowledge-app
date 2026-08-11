-- ============================================
-- 个人知识管理系统 数据结构 v1
-- 在 Supabase SQL Editor 里执行此脚本
--
-- ⚠️警告：此脚本只能在首次建库时跑一次！
-- 如果你的数据库已经有数据，绝对不要重新执行这个文件！
-- 后续结构变更请只执行单独的 ALTER TABLE 语句，不要把它们拼接到这个文件后面一起跑！
-- 执行任何 SQL 之前，先去 App 顶部点一下“⬇️ 导出”导出一份 JSON 备份！
-- ============================================

-- 1. 知识库（按知识域划分，如"心理学""产品设计"）
create table knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text default '📚',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. 知识点（AI 归纳后的结构化知识，隶属某个知识库）
create table knowledge_points (
  id uuid primary key default gen_random_uuid(),
  base_id uuid references knowledge_bases(id) on delete cascade,
  title text not null,
  content text,
  category text,
  tags text[],
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. 原始输入（随手记的原始素材）
create table raw_inputs (
  id uuid primary key default gen_random_uuid(),
  base_id uuid references knowledge_bases(id) on delete set null,
  point_id uuid references knowledge_points(id) on delete set null,
  input_type text not null,
  raw_content text,
  media_url text,
  processed boolean default false,
  created_at timestamptz default now()
);

-- 4. 知识关联（知识点之间的关系）
create table knowledge_links (
  id uuid primary key default gen_random_uuid(),
  from_point_id uuid references knowledge_points(id) on delete cascade,
  to_point_id uuid references knowledge_points(id) on delete cascade,
  relation_type text,
  created_at timestamptz default now()
);

-- 索引
create index idx_points_base on knowledge_points(base_id);
create index idx_raw_base on raw_inputs(base_id);
create index idx_raw_processed on raw_inputs(processed);
create index idx_links_from on knowledge_links(from_point_id);

-- 行级安全
alter table knowledge_bases enable row level security;
alter table knowledge_points enable row level security;
alter table raw_inputs enable row level security;
alter table knowledge_links enable row level security;

create policy "allow all bases" on knowledge_bases for all using (true) with check (true);
create policy "allow all points" on knowledge_points for all using (true) with check (true);
create policy "allow all raw" on raw_inputs for all using (true) with check (true);
create policy "allow all links" on knowledge_links for all using (true) with check (true);
