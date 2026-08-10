import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isConfigured, listBases, createBase, deleteBase } from '../lib/supabase'
import { aiConfigured, generateLearningPath } from '../lib/ai'

const EMOJIS = ['📚', '🎯', '💡', '🧪', '🎨', '🔬', '📐', '🌱', '🏗️', '🔑', '🧬', '🎓']

export default function Home() {
  const [bases, setBases] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [showLearn, setShowLearn] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [icon, setIcon] = useState('📚')
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  useEffect(() => { if (isConfigured) load() }, [])

  async function load() {
    const data = await listBases()
    setBases(data)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createBase({ name: name.trim(), description: desc.trim(), icon })
      setShowNew(false); setName(''); setDesc(''); setIcon('📚')
      await load()
    } catch (e) { alert('创建失败：' + e.message) }
    setLoading(false)
  }

  async function handleLearn() {
    if (!topic.trim() || !aiConfigured) return
    setLoading(true)
    try {
      const result = await generateLearningPath(topic.trim())
      const base = await createBase({
        name: result.base_name || `学习 · ${topic}`,
        description: `AI 生成 · 由主题"${topic}"自动构建`,
        icon: '🎓'
      })
      // 依次创建知识点
      for (const p of result.points || []) {
        const { supabase } = await import('../lib/supabase')
        await supabase.from('knowledge_points').insert({
          base_id: base.id,
          title: p.title,
          content: p.content,
          category: p.category || '',
          tags: p.tags || [],
          status: 'active'
        })
      }
      setShowLearn(false); setTopic('')
      await load()
      alert(`✅ 已为你生成 ${result.points.length} 个知识点，进入知识库查看`)
      nav(`/base/${base.id}`)
    } catch (e) { alert('生成失败：' + e.message) }
    setLoading(false)
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!confirm('确认删除此知识库及其所有知识点？')) return
    await deleteBase(id)
    await load()
  }

  return (
    <div className="home">
      <div className="home-header">
        <h1>我的知识宇宙</h1>
        <p className="subtitle">每一个知识库，都是你通向精通的一扇门</p>
      </div>

      <div className="quick-actions">
        <button className="action-btn primary" onClick={() => setShowNew(true)}>
          <span className="icon">➕</span>
          <span>新建知识库</span>
        </button>
        {aiConfigured && (
          <button className="action-btn" onClick={() => setShowLearn(true)}>
            <span className="icon">✨</span>
            <span>AI 帮我学</span>
          </button>
        )}
      </div>

      <div className="base-grid">
        {bases.map(b => (
          <div key={b.id} className="base-card" onClick={() => nav(`/base/${b.id}`)}>
            <div className="base-card-icon">{b.icon}</div>
            <div className="base-card-name">{b.name}</div>
            {b.description && <div className="base-card-desc">{b.description}</div>}
            <button className="base-card-del" onClick={(e) => handleDelete(b.id, e)}>✕</button>
          </div>
        ))}
      </div>

      {bases.length === 0 && !showNew && !showLearn && (
        <div className="empty">
          <div className="empty-icon">🌱</div>
          <div>点击上方按钮，开始你的第一个知识库</div>
        </div>
      )}

      {/* 新建知识库弹窗 */}
      {showNew && (
        <div className="modal-mask" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>新建知识库</h2>
            <label>选个图标</label>
            <div className="emoji-row">
              {EMOJIS.map(e => (
                <span key={e} className={`emoji ${e === icon ? 'active' : ''}`} onClick={() => setIcon(e)}>{e}</span>
              ))}
            </div>
            <label>名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：亲密关系、产品设计、Python" autoFocus />
            <label>描述（可选）</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="这个知识库关于什么？" rows={2} />
            <div className="modal-actions">
              <button onClick={() => setShowNew(false)}>取消</button>
              <button className="primary" onClick={handleCreate} disabled={loading || !name.trim()}>
                {loading ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 学习弹窗 */}
      {showLearn && (
        <div className="modal-mask" onClick={() => setShowLearn(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>✨ AI 帮我学</h2>
            <p className="modal-hint">告诉 AI 你想学什么，它会自动为你搭建一套结构化的知识体系</p>
            <label>想学的主题</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="如：依恋理论、认知行为疗法、依恋心理学…" rows={3} autoFocus />
            <div className="modal-actions">
              <button onClick={() => setShowLearn(false)}>取消</button>
              <button className="primary" onClick={handleLearn} disabled={loading || !topic.trim()}>
                {loading ? 'AI 正在生成…' : '生成知识体系'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
