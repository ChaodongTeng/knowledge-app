import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key && !url.includes('你的'))

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Supabase 在部分网络环境下偶尔会出现瞬时连接失败。
// 对网络错误和 5xx 自动重试两次，避免一次抖动就让用户操作失败。
async function fetchWithRetry(input, init, maxRetries = 2) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(input, init)
      if (response.status < 500 || attempt === maxRetries) return response
      lastError = new Error(`服务暂时不可用（HTTP ${response.status}）`)
    } catch (error) {
      lastError = error
      if (attempt === maxRetries) break
    }
    await sleep(600 * (attempt + 1))
  }
  throw lastError
}

export const supabase = isConfigured
  ? createClient(url, key, { global: { fetch: fetchWithRetry } })
  : null

export function readableSupabaseError(error, action = '操作') {
  const message = error?.message || String(error || '未知错误')
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return `${action}失败：无法连接 Supabase。已自动重试，仍未成功。请检查当前网络后再试；你的现有数据不会因此被删除。`
  }
  if (/jwt|api key|unauthorized|invalid.*key/i.test(message)) {
    return `${action}失败：Supabase 密钥无效，请检查 GitHub Secrets 中的 VITE_SUPABASE_ANON_KEY。`
  }
  return `${action}失败：${message}`
}

// ---------- 知识库 ----------
export async function listBases() {
  const { data, error } = await supabase
    .from('knowledge_bases').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createBase({ name, description, icon }) {
  const { data, error } = await supabase
    .from('knowledge_bases').insert({ name, description, icon }).select().single()
  if (error) throw error
  return data
}

export async function updateBase(id, patch) {
  const row = {
    ...patch,
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('knowledge_bases').update(row).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteBase(id) {
  const { error } = await supabase.from('knowledge_bases').delete().eq('id', id)
  if (error) throw error
}

// ---------- 知识点 ----------
export async function listPoints(baseId) {
  const { data, error } = await supabase
    .from('knowledge_points').select('*').eq('base_id', baseId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPoint(point) {
  // 支持新字段：parent_category, difficulty, prerequisites
  const row = {
    base_id: point.base_id,
    title: point.title,
    content: point.content,
    category: point.category || '',
    tags: point.tags || [],
    status: point.status || 'active',
    parent_category: point.parent_category || '',
    difficulty: point.difficulty || 'intermediate',
    prerequisites: point.prerequisites || []
  }
  const { data, error } = await supabase
    .from('knowledge_points').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updatePoint(id, patch) {
  const { data, error } = await supabase
    .from('knowledge_points').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePoint(id) {
  const { error } = await supabase.from('knowledge_points').delete().eq('id', id)
  if (error) throw error
}

// ---------- 原始输入 ----------
export async function createRawInput(input) {
  const { data, error } = await supabase
    .from('raw_inputs').insert(input).select().single()
  if (error) throw error
  return data
}

export async function uploadMedia(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return data.publicUrl
}

// ---------- 知识关联 ----------
export async function listLinks(baseId) {
  const points = await listPoints(baseId)
  const ids = points.map(p => p.id)
  if (ids.length === 0) return { points, links: [] }
  const { data, error } = await supabase
    .from('knowledge_links').select('*').in('from_point_id', ids)
  if (error) throw error
  return { points, links: data }
}

export async function createLink(from_point_id, to_point_id, relation_type) {
  const { data, error } = await supabase
    .from('knowledge_links').insert({ from_point_id, to_point_id, relation_type })
    .select().single()
  if (error) throw error
  return data
}

// ---------- 全量导出（数据永远能带走）----------
export async function exportAll() {
  const [bases, points, raws, links] = await Promise.all([
    supabase.from('knowledge_bases').select('*'),
    supabase.from('knowledge_points').select('*'),
    supabase.from('raw_inputs').select('*'),
    supabase.from('knowledge_links').select('*')
  ])
  return {
    exported_at: new Date().toISOString(),
    version: 1,
    knowledge_bases: bases.data || [],
    knowledge_points: points.data || [],
    raw_inputs: raws.data || [],
    knowledge_links: links.data || []
  }
}
