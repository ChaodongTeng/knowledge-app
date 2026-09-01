// 数据层 —— 本地优先（IndexedDB）。数据完全属于你，离线可用，不依赖任何云。
import { all, get, put, del } from './localdb'

export const isConfigured = true

export function uuid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function readableError(e, action) {
  return `${action}失败：${(e && e.message) || e || '未知错误'}`
}

// ---------- 知识库 ----------
export async function listBases() {
  const rows = await all('bases')
  rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
  return rows
}

export async function createBase({ name, description, icon }) {
  const now = new Date().toISOString()
  const row = { id: uuid(), name, description: description || '', icon: icon || '📚', created_at: now, updated_at: now }
  await put('bases', row)
  return row
}

export async function updateBase(id, patch) {
  const cur = await get('bases', id)
  if (!cur) throw new Error('知识库不存在')
  const row = { ...cur, ...patch, updated_at: new Date().toISOString() }
  await put('bases', row)
  return row
}

export async function deleteBase(id) {
  await del('bases', id)
  // 级联删除该库下的知识点与原始素材（与原外键行为一致）
  const pts = (await all('points')).filter(p => p.base_id === id)
  for (const p of pts) await del('points', p.id)
  const raws = (await all('raws')).filter(r => r.base_id === id)
  for (const r of raws) await del('raws', r.id)
}

// ---------- 知识点 ----------
export async function listPoints(baseId) {
  const rows = (await all('points')).filter(p => p.base_id === baseId)
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  return rows
}

export async function createPoint(point) {
  const now = new Date().toISOString()
  const row = {
    id: uuid(),
    base_id: point.base_id,
    title: point.title,
    content: point.content || '',
    category: point.category || '',
    tags: point.tags || [],
    status: point.status || 'active',
    parent_category: point.parent_category || '',
    difficulty: point.difficulty || 'intermediate',
    prerequisites: point.prerequisites || [],
    created_at: now,
    updated_at: now
  }
  await put('points', row)
  return row
}

export async function updatePoint(id, patch) {
  const cur = await get('points', id)
  if (!cur) throw new Error('知识点不存在')
  const row = { ...cur, ...patch, updated_at: new Date().toISOString() }
  await put('points', row)
  return row
}

export async function deletePoint(id) {
  await del('points', id)
  const links = (await all('links')).filter(l => l.from_point_id === id || l.to_point_id === id)
  for (const l of links) await del('links', l.id)
}

// ---------- 原始输入 ----------
export async function listRawInputs(baseId, processed) {
  let rows = (await all('raws')).filter(r => r.base_id === baseId)
  if (typeof processed === 'boolean') rows = rows.filter(r => r.processed === processed)
  rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  return rows
}

export async function createRawInput(input) {
  const now = new Date().toISOString()
  const row = {
    id: uuid(),
    base_id: input.base_id,
    input_type: input.input_type,
    raw_content: input.raw_content || '',
    media_url: input.media_url || null,
    processed: false,
    created_at: now
  }
  await put('raws', row)
  return row
}

export async function updateRawInput(id, patch) {
  const cur = await get('raws', id)
  if (!cur) throw new Error('素材不存在')
  const row = { ...cur, ...patch }
  await put('raws', row)
  return row
}

// ---------- 媒体（图片存本地） ----------
export async function uploadMedia(file) {
  const row = { id: uuid(), blob: file, type: file.type, name: file.name, created_at: new Date().toISOString() }
  await put('media', row)
  return `idb://media/${row.id}`
}

export async function getMediaBlob(id) {
  const row = await get('media', id)
  return row ? row.blob : null
}

// ---------- 知识关联 ----------
export async function listLinks(baseId) {
  const points = await listPoints(baseId)
  const ids = new Set(points.map(p => p.id))
  const links = (await all('links')).filter(l => ids.has(l.from_point_id))
  return { points, links }
}

export async function createLink(from_point_id, to_point_id, relation_type) {
  const row = { id: uuid(), from_point_id, to_point_id, relation_type, created_at: new Date().toISOString() }
  await put('links', row)
  return row
}

// ---------- 全量导出 / 导入（数据永远能带走） ----------
export async function exportAll() {
  const [bases, points, raws, links] = await Promise.all([
    all('bases'), all('points'), all('raws'), all('links')
  ])
  return {
    exported_at: new Date().toISOString(),
    version: 1,
    knowledge_bases: bases,
    knowledge_points: points,
    raw_inputs: raws,
    knowledge_links: links
  }
}

export async function importAll(data) {
  const counts = { bases: 0, points: 0, raws: 0, links: 0 }
  for (const r of data.knowledge_bases || []) { await put('bases', r); counts.bases++ }
  for (const r of data.knowledge_points || []) { await put('points', r); counts.points++ }
  for (const r of data.raw_inputs || []) { await put('raws', r); counts.raws++ }
  for (const r of data.knowledge_links || []) { await put('links', r); counts.links++ }
  return counts
}
