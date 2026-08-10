import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key && !url.includes('你的'))

export const supabase = isConfigured ? createClient(url, key) : null

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
  const { data, error } = await supabase
    .from('knowledge_points').insert(point).select().single()
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
