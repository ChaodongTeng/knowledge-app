// GitHub 私有仓库同步层 —— 把数据自动存进你自己的私有仓库，跨设备、防丢失
const REPO = 'ChaodongTeng/knowledge-data'
const FILE = 'data.json'
const TOKEN_KEY = 'gh-data-token'
const META_KEY = 'gh-sync-meta'

export function getToken() { return localStorage.getItem(TOKEN_KEY) || '' }
export function setToken(t) {
  if (t && t.trim()) localStorage.setItem(TOKEN_KEY, t.trim())
  else localStorage.removeItem(TOKEN_KEY)
}
export function hasToken() { return Boolean(getToken()) }
export function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') } catch { return {} } }
function setMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)) }

function b64encode(s) { return btoa(unescape(encodeURIComponent(s))) }
function b64decode(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, '')))) }

async function api(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    }
  })
  if (!res.ok) {
    const e = new Error(`GitHub ${res.status}`)
    e.status = res.status
    throw e
  }
  return res.status === 204 ? null : res.json()
}

export async function pullRemote() {
  const r = await api(`contents/${FILE}`)
  return { data: JSON.parse(b64decode(r.content)), sha: r.sha }
}

export async function pushLocal(exportData) {
  let sha = null
  try { sha = (await api(`contents/${FILE}`)).sha } catch (e) { if (e.status !== 404) throw e }
  const body = { message: `sync ${new Date().toISOString()}`, content: b64encode(JSON.stringify(exportData)) }
  if (sha) body.sha = sha
  await api(`contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) })
}

let timer = null
export function scheduleSync(getExport) {
  if (!hasToken()) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      await pushLocal(await getExport())
      setMeta({ ok: true, at: new Date().toISOString() })
    } catch (e) {
      setMeta({ ok: false, at: new Date().toISOString(), error: e.message, status: e.status })
    }
  }, 1500)
}
