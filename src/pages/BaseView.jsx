import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  isConfigured,
  supabase,
  listBases, listPoints, createPoint, updatePoint, deletePoint,
  createRawInput, uploadMedia
} from '../lib/supabase'
import { aiConfigured, summarizeToPoint, suggestMissingPoints } from '../lib/ai'

export default function BaseView() {
  const { id } = useParams()
  const nav = useNavigate()
  const [base, setBase] = useState(null)
  const [points, setPoints] = useState([])
  const [inputMode, setInputMode] = useState('text')
  const [textDraft, setTextDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [editingPoint, setEditingPoint] = useState(null)
  const [filterCat, setFilterCat] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef()
  const dropZoneRef = useRef()

  useEffect(() => {
    (async () => {
      const bases = await listBases()
      const b = bases.find(x => x.id === id)
      if (!b) return nav('/')
      setBase(b)
      setPoints(await listPoints(id))
    })()
  }, [id])

  function handleImageSelect(file) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = e => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleImageSelect(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setIsDragging(false)
  }

  useEffect(() => {
    function handlePaste(e) {
      if (inputMode !== 'image') return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) handleImageSelect(file)
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [inputMode])

  async function submitInput() {
    if (!isConfigured) return alert('请先配置 Supabase')
    try {
      if (inputMode === 'text') {
        if (!textDraft.trim()) return
        await createRawInput({ base_id: id, input_type: 'text', raw_content: textDraft })
        setTextDraft('')
      } else if (inputMode === 'link') {
        if (!linkDraft.trim()) return
        await createRawInput({ base_id: id, input_type: 'link', raw_content: linkDraft })
        setLinkDraft('')
      } else if (inputMode === 'image') {
        if (!imageFile) return alert('先选一张图（点击选择、拖拽、或粘贴）')
        const url = await uploadMedia(imageFile)
        await createRawInput({ base_id: id, input_type: 'image', media_url: url, raw_content: '(图片)' })
        setImageFile(null)
        setImagePreview(null)
        if (fileRef.current) fileRef.current.value = ''
      } else if (inputMode === 'voice') {
        alert('语音录制在 MVP 先用文字替代')
      }
      await refresh()
    } catch (e) { alert('保存失败：' + e.message) }
  }

  async function processPending() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    setProcessing(true)
    try {
      const { data: raws } = await supabase.from('raw_inputs')
        .select('*').eq('base_id', id).eq('processed', false)
        .order('created_at')
      if (!raws || raws.length === 0) { alert('暂无待处理的笔记') ; setProcessing(false); return }
      for (const r of raws) {
        const result = await summarizeToPoint(r.raw_content || '', base.name)
        await createPoint({
          base_id: id,
          title: result.title,
          content: result.content,
          category: result.category || '',
          tags: result.tags || [],
          status: 'active'
        })
        await supabase.from('raw_inputs').update({ processed: true }).eq('id', r.id)
      }
      await refresh()
      alert(`✅ 已为你生成 ${raws.length} 个知识点`)
    } catch (e) { alert('AI 归纳失败：' + e.message) }
    setProcessing(false)
  }

  async function fetchSuggestions() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    setShowSuggest(true)
    setSuggestions([])
    try {
      const titles = points.map(p => p.title)
      const s = await suggestMissingPoints(base.name, titles)
      setSuggestions(s)
    } catch (e) { alert('获取建议失败：' + e.message) }
  }

  async function adoptSuggestion(s) {
    await createPoint({
      base_id: id,
      title: s.title,
      content: s.reason,
      category: s.category || '',
      tags: [],
      status: 'draft'
    })
    setSuggestions(ss => ss.filter(x => x.title !== s.title))
    await refresh()
  }

  async function refresh() { setPoints(await listPoints(id)) }

  const categories = React.useMemo(() => {
    const map = new Map()
    for (const p of points) {
      const c = p.category || '未分类'
      if (!map.has(c)) map.set(c, [])
      map.get(c).push(p)
    }
    return map
  }, [points])

  if (!base) return <div className="loading">加载中…</div>

  return (
    <div className="base-view">
      <div className="base-header">
        <div className="base-header-top">
          <span className="base-icon-big">{base.icon}</span>
          <div>
            <h1>{base.name}</h1>
            {base.description && <div className="base-desc">{base.description}</div>}
          </div>
        </div>
        <div className="base-stats">
          <span>📝 {points.length} 个知识点</span>
          <span>🗂️ {categories.size} 个主题</span>
        </div>
      </div>

      <div className="input-zone">
        <div className="input-mode-tabs">
          {['text', 'link', 'image', 'voice'].map(m => (
            <button key={m} className={inputMode === m ? 'active' : ''}
              onClick={() => setInputMode(m)}>
              {m === 'text' && '✍️ 文字'}
              {m === 'link' && '🔗 链接'}
              {m === 'image' && '🖼️ 图片'}
              {m === 'voice' && '🎙️ 语音'}
            </button>
          ))}
        </div>
        <div className="input-body">
          {inputMode === 'text' && (
            <textarea value={textDraft} onChange={e => setTextDraft(e.target.value)}
              placeholder="随手记点什么…语音转文字、复制粘贴都行，AI 会帮你整理成知识点" rows={4} />
          )}
          {inputMode === 'link' && (
            <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
              placeholder="贴个链接（文章/视频/课程）…" />
          )}
          {inputMode === 'image' && (
            <div
              ref={dropZoneRef}
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="预览" />
                  <button className="remove-image" onClick={(e) => {
                    e.stopPropagation()
                    setImageFile(null)
                    setImagePreview(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}>✕</button>
                </div>
              ) : (
                <div className="drop-zone-content">
                  <div className="drop-icon">🖼️</div>
                  <div className="drop-text">
                    <strong>点击选择</strong>、<strong>拖拽图片到这里</strong>、或<strong>直接粘贴</strong>（Ctrl/Cmd+V）
                  </div>
                  <div className="drop-hint">支持 JPG、PNG、GIF、WebP</div>
                </div>
              )}
              <input
                type="file"
                ref={fileRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleImageSelect(file)
                }}
              />
            </div>
          )}
          {inputMode === 'voice' && <div className="voice-hint">🎙️ 语音录制在下一版本支持。当前可用手机自带语音输入法转文字后选"✍️ 文字"输入。</div>}
          <button className="primary" onClick={submitInput}>💾 保存原始素材</button>
        </div>
      </div>

      <div className="action-bar">
        <button className="action-btn" onClick={processPending} disabled={processing}>
          {processing ? '⏳ AI 处理中…' : '🪄 让 AI 归纳未处理的笔记'}
        </button>
        {aiConfigured && (
          <button className="action-btn" onClick={fetchSuggestions}>
            🔮 AI 建议我还缺什么
          </button>
        )}
      </div>

      {showSuggest && (
        <div className="suggest-box">
          <div className="suggest-head">
            <h3>🔮 AI 建议补全的知识点</h3>
            <button className="icon-btn" onClick={() => setShowSuggest(false)}>✕</button>
          </div>
          {suggestions.length === 0 ? (
            <div className="muted">AI 思考中…</div>
          ) : (
            suggestions.map((s, i) => (
              <div key={i} className="suggest-item">
                <div className="suggest-title">📌 {s.title} <span className="tag">{s.category}</span></div>
                <div className="suggest-reason">{s.reason}</div>
                <div className="suggest-actions">
                  <button className="primary" onClick={() => adoptSuggestion(s)}>✔️ 采纳并创建</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {points.length > 0 && (
        <div className="point-list">
          <div className="cat-filter">
            <span className={filterCat === '' ? 'active' : ''} onClick={() => setFilterCat('')}>全部</span>
            {[...categories.keys()].map(c => (
              <span key={c} className={filterCat === c ? 'active' : ''} onClick={() => setFilterCat(c)}>{c}</span>
            ))}
          </div>
          {[...categories.entries()].filter(([c]) => !filterCat || c === filterCat).map(([cat, pts]) => (
            <div key={cat} className="cat-section">
              <h3 className="cat-title">📁 {cat} <span className="muted">({pts.length})</span></h3>
              {pts.map(p => (
                <div key={p.id} className={`point-card ${p.status === 'draft' ? 'draft' : ''}`}>
                  <div className="point-title">
                    {p.title}
                    {p.status === 'draft' && <span className="badge">草稿</span>}
                  </div>
                  <div className="point-content">{p.content}</div>
                  <div className="point-tags">
                    {(p.tags || []).map(t => <span key={t} className="tag">{t}</span>)}
                  </div>
                  <div className="point-actions">
                    <button className="icon-btn" onClick={() => setEditingPoint(p)}>✏️ 编辑</button>
                    <button className="icon-btn" onClick={async () => {
                      if (confirm('删除这条知识点？')) { await deletePoint(p.id); await refresh() }
                    }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {points.length === 0 && !showSuggest && (
        <div className="empty">
          <div className="empty-icon">✍️</div>
          <div>先用"随手记"记录一些素材，再让 AI 帮你整理成知识点</div>
        </div>
      )}

      {editingPoint && (
        <div className="modal-mask" onClick={() => setEditingPoint(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>编辑知识点</h2>
            <label>标题</label>
            <input value={editingPoint.title} onChange={e => setEditingPoint({ ...editingPoint, title: e.target.value })} />
            <label>分类</label>
            <input value={editingPoint.category || ''} onChange={e => setEditingPoint({ ...editingPoint, category: e.target.value })} />
            <label>内容</label>
            <textarea value={editingPoint.content || ''} onChange={e => setEditingPoint({ ...editingPoint, content: e.target.value })} rows={8} />
            <label>标签（逗号分隔）</label>
            <input value={(editingPoint.tags || []).join(',')} onChange={e => setEditingPoint({ ...editingPoint, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            <div className="modal-actions">
              <button onClick={() => setEditingPoint(null)}>取消</button>
              <button className="primary" onClick={async () => {
                await updatePoint(editingPoint.id, {
                  title: editingPoint.title,
                  content: editingPoint.content,
                  category: editingPoint.category,
                  tags: editingPoint.tags
                })
                setEditingPoint(null); await refresh()
              }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
