import React, { useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { exportAll, importAll } from './lib/db'
import { getToken, setToken, hasToken, pullRemote, pushLocal, getMeta } from './lib/gitsync'
import { aiConfigured } from './lib/ai'
import Home from './pages/Home.jsx'
import BaseView from './pages/BaseView.jsx'

function ConfigBanner() {
  return (
    <div className="banner">
      <div className="banner-item">💾 数据存在你自己的浏览器（本地优先，离线可用）。配置 ⚙️ 同步 后会自动备份到你的 GitHub 私有仓库，换设备自动恢复。</div>
      {!aiConfigured && <div className="banner-item">⚠️ DeepSeek 未配置：AI 归纳/补全功能不可用（手动笔记仍可用）</div>}
    </div>
  )
}

function ExportBtn() {
  const [running, setRunning] = useState(false)
  async function doExport() {
    setRunning(true)
    try {
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `knowledge-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('导出失败：' + e.message)
    } finally {
      setRunning(false)
    }
  }
  return <button className="icon-btn" onClick={doExport} disabled={running}>{running ? '导出中…' : '⬇️ 导出'}</button>
}

function ImportBtn() {
  const fileRef = useRef()
  const [running, setRunning] = useState(false)
  async function onFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setRunning(true)
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object') throw new Error('文件格式不对')
      const counts = await importAll(data)
      alert(`✅ 导入完成：知识库 ${counts.bases} 个、知识点 ${counts.points} 个、素材 ${counts.raws} 条`)
      window.location.reload()
    } catch (err) {
      alert('导入失败：' + err.message)
    } finally {
      setRunning(false)
    }
  }
  return (
    <>
      <button className="icon-btn" onClick={() => fileRef.current?.click()} disabled={running}>{running ? '导入中…' : '⬆️ 导入'}</button>
      <input type="file" ref={fileRef} accept="application/json,.json" style={{ display: 'none' }} onChange={onFile} />
    </>
  )
}

function SyncBtn() {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(getToken())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true); setMsg('')
    setToken(val)
    try {
      await pushLocal(await exportAll())
      setMsg('✅ 钥匙已保存，数据已同步到你的 GitHub 私有仓库')
    } catch (e) {
      const hint = (e.status === 401 || e.status === 403) ? '：钥匙无效或权限不对，请检查是否选了 knowledge-data 仓库、Contents 是否为 Read and write' : ''
      setMsg(`❌ 同步失败（${e.message}）${hint}`)
    }
    setBusy(false)
  }

  async function syncNow() {
    setBusy(true); setMsg('')
    try {
      await pushLocal(await exportAll())
      setMsg('✅ 已同步')
    } catch (e) {
      setMsg(`❌ ${e.message}`)
    }
    setBusy(false)
  }

  const meta = getMeta()
  return (
    <>
      <button className="icon-btn" onClick={() => { setVal(getToken()); setMsg(''); setOpen(true) }}>⚙️ 同步</button>
      {open && (
        <div className="modal-mask" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>☁️ 云同步（GitHub 私有仓库）</h2>
            <p className="modal-hint">每次增删改后自动备份到你自己的 GitHub 私有仓库 knowledge-data；新设备打开 App 时自动恢复。钥匙只存在当前设备，不会上传。</p>
            <label>访问钥匙（token）</label>
            <textarea value={val} onChange={e => setVal(e.target.value)} rows={3} placeholder="粘贴你在 GitHub 创建的 token（github_pat_ 或 ghp_ 开头）" />
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {hasToken() && meta.at
                ? `上次同步：${String(meta.at).replace('T', ' ').slice(0, 19)} ${meta.ok ? '✅' : '❌ ' + (meta.error || '')}`
                : '尚未配置同步'}
            </div>
            {msg && <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{msg}</div>}
            <div className="modal-actions">
              <button onClick={() => setOpen(false)}>关闭</button>
              {hasToken() && <button onClick={syncNow} disabled={busy}>立即同步</button>}
              <button className="primary" onClick={save} disabled={busy || !val.trim()}>{busy ? '同步中…' : '保存并同步'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TopBar({ onHome }) {
  return (
    <div className="topbar">
      <div className="topbar-left" onClick={onHome} style={{ cursor: 'pointer' }}>
        <span className="logo">🧠</span>
        <span className="brand">知识库</span>
      </div>
      <div className="topbar-right">
        <SyncBtn />
        <ImportBtn />
        <ExportBtn />
      </div>
    </div>
  )
}

export default function App() {
  const nav = useNavigate()

  // 首次打开：本地是空的且云端有数据 → 自动恢复
  useEffect(() => {
    (async () => {
      if (!hasToken()) return
      try {
        const { data } = await pullRemote()
        if (!data) return
        const local = await exportAll()
        const localEmpty = !local.knowledge_bases.length && !local.knowledge_points.length && !local.raw_inputs.length
        const remoteHas = (data.knowledge_bases || []).length || (data.knowledge_points || []).length || (data.raw_inputs || []).length
        if (localEmpty && remoteHas) {
          await importAll(data)
          window.location.reload()
        }
      } catch (e) {
        console.warn('拉取云端数据失败：', e.message)
      }
    })()
  }, [])

  return (
    <>
      <TopBar onHome={() => nav('/')} />
      <ConfigBanner />
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/base/:id" element={<BaseView />} />
        </Routes>
      </div>
    </>
  )
}
