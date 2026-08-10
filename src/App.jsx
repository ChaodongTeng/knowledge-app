import React, { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { isConfigured, listBases, exportAll } from './lib/supabase'
import { aiConfigured } from './lib/ai'
import Home from './pages/Home.jsx'
import BaseView from './pages/BaseView.jsx'

function ConfigBanner() {
  const db = isConfigured, ai = aiConfigured
  if (db && ai) return null
  return (
    <div className="banner">
      <div className="banner-title">⚙️ 首次配置</div>
      {!db && <div className="banner-item">❌ Supabase 未配置：把 .env.example 复制成 .env.local 并填入 Supabase URL / anon key</div>}
      {db && <div className="banner-item">✅ Supabase 已连接</div>}
      {!ai && <div className="banner-item">⚠️ DeepSeek 未配置：AI 归纳/补全功能不可用（手动笔记仍可用）。在 .env.local 填入 VITE_DEEPSEEK_API_KEY</div>}
      {ai && <div className="banner-item">✅ AI 已连接</div>}
    </div>
  )
}

function ExportBtn() {
  const [running, setRunning] = useState(false)
  async function doExport() {
    if (!isConfigured) return alert('请先配置 Supabase')
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

function TopBar({ onHome }) {
  return (
    <div className="topbar">
      <div className="topbar-left" onClick={onHome} style={{ cursor: 'pointer' }}>
        <span className="logo">🧠</span>
        <span className="brand">知识库</span>
      </div>
      <div className="topbar-right">
        <ExportBtn />
      </div>
    </div>
  )
}

export default function App() {
  const nav = useNavigate()
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
