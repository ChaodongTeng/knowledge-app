import React, { useState, useRef } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { exportAll, importAll } from './lib/db'
import { aiConfigured } from './lib/ai'
import Home from './pages/Home.jsx'
import BaseView from './pages/BaseView.jsx'

function ConfigBanner() {
  return (
    <div className="banner">
      <div className="banner-item">💾 数据存在你自己的浏览器里（本地优先，离线可用，终身归属你）。换设备请用右上角 ⬇️ 导出 / ⬆️ 导入 迁移。</div>
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

function TopBar({ onHome }) {
  return (
    <div className="topbar">
      <div className="topbar-left" onClick={onHome} style={{ cursor: 'pointer' }}>
        <span className="logo">🧠</span>
        <span className="brand">知识库</span>
      </div>
      <div className="topbar-right">
        <ImportBtn />
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
