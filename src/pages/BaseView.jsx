import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  isConfigured,
  supabase,
  listBases, listPoints, createPoint, updatePoint, deletePoint,
  createRawInput, uploadMedia
} from '../lib/supabase'
import { aiConfigured, buildKnowledgeTree, suggestMissingPoints, reorganizeKnowledgeTree, expandPoint } from '../lib/ai'

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
  const [expandPrompt, setExpandPrompt] = useState('')
  const [expanding, setExpanding] = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  // 文字模式下附加的图片（用于混合文档：文字+图）
  const [textImageFile, setTextImageFile] = useState(null)
  const [textImagePreview, setTextImagePreview] = useState(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  // AI 重新梳理知识树
  const [showReorganize, setShowReorganize] = useState(false)
  const [reorganizePrompt, setReorganizePrompt] = useState('')
  const [reorganizing, setReorganizing] = useState(false)
  const fileRef = useRef()
  const textImageRef = useRef()
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
  function handleDrop(e) { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleImageSelect(f) }
  function handleDragOver(e) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e) { e.preventDefault(); setIsDragging(false) }

  // 文字模式：附加图片
  function handleTextImageSelect(file) {
    if (!file || !file.type.startsWith('image/')) return
    setTextImageFile(file)
    const reader = new FileReader()
    reader.onload = e => setTextImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }
  function handleTextImageDrop(e) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleTextImageSelect(f) }
  function handleTextImageDragOver(e) { e.preventDefault() }

  // 全局粘贴：根据当前模式分发到对应处理器
  useEffect(() => {
    function handlePaste(e) {
      const items = e.clipboardData?.items; if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            if (inputMode === 'image') handleImageSelect(f)
            else if (inputMode === 'text') handleTextImageSelect(f)
          }
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
        if (!textDraft.trim() && !textImageFile) return
        let finalText = textDraft
        let mediaUrl = null
        if (textImageFile) {
          setOcrRunning(true)
          try {
            const { default: Tesseract } = await import('tesseract.js')
            const { data } = await Tesseract.recognize(textImageFile, 'chi_sim+eng')
            const ocrText = (data.text || '').trim()
            if (ocrText) finalText = `${finalText}\n\n[图片文字识别]\n${ocrText}`
          } catch (ocrErr) {
            console.warn('OCR 失败，仅保存文字和图片', ocrErr)
          }
          setOcrRunning(false)
          mediaUrl = await uploadMedia(textImageFile)
        }
        await createRawInput({ base_id: id, input_type: 'text', raw_content: finalText || '(图片)', media_url: mediaUrl })
        setTextDraft(''); setTextImageFile(null); setTextImagePreview(null)
        if (textImageRef.current) textImageRef.current.value = ''
      } else if (inputMode === 'link') {
        if (!linkDraft.trim()) return
        await createRawInput({ base_id: id, input_type: 'link', raw_content: linkDraft })
        setLinkDraft('')
      } else if (inputMode === 'image') {
        if (!imageFile) return alert('先选一张图')
        const url = await uploadMedia(imageFile)
        await createRawInput({ base_id: id, input_type: 'image', media_url: url, raw_content: '(图片)' })
        setImageFile(null); setImagePreview(null)
        if (fileRef.current) fileRef.current.value = ''
      }
      await refresh()
    } catch (e) { alert('保存失败：' + e.message) }
  }

  async function processPending() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    setProcessing(true)
    try {
      const { data: raws } = await supabase.from('raw_inputs')
        .select('*').eq('base_id', id).eq('processed', false).order('created_at')
      if (!raws || raws.length === 0) { alert('暂无待处理的笔记'); setProcessing(false); return }
      const existingPoints = points.map(p => ({ id: p.id, title: p.title, category: p.category }))
      const treeResult = await buildKnowledgeTree(base.name, raws.map(r => ({ id: r.id, raw_content: r.raw_content, input_type: r.input_type })), existingPoints)
      for (const point of treeResult.newPoints) {
        await createPoint({
          base_id: id, title: point.title, content: point.content,
          category: point.category || '', parent_category: point.parentCategory || point.category || '',
          tags: point.tags || [], prerequisites: point.prerequisites || [], status: 'active'
        })
      }
      for (const r of raws) { await supabase.from('raw_inputs').update({ processed: true }).eq('id', r.id) }
      await refresh()
      alert(`✅ 已为你生成 ${treeResult.newPoints.length} 个知识点\n💡 ${treeResult.treeInsight || ''}`)
    } catch (e) { alert('AI 归纳失败：' + e.message) }
    setProcessing(false)
  }

  async function fetchSuggestions() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    setShowSuggest(true); setSuggestions([])
    try {
      const s = await suggestMissingPoints(base.name, points)
      setSuggestions(s)
    } catch (e) { alert('获取建议失败：' + e.message) }
  }

  async function adoptSuggestion(s) {
    await createPoint({ base_id: id, title: s.title, content: s.reason, category: s.category || '', tags: [], status: 'draft' })
    setSuggestions(ss => ss.filter(x => x.title !== s.title))
    await refresh()
  }

  // ---- AI 重新梳理知识树（用户指导）----
  async function runReorganize() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    if (!reorganizePrompt.trim()) return alert('请输入整理要求，比如"按难度从低到高排列"、"把网络相关的都归到一个大类下"')
    setReorganizing(true)
    try {
      const result = await reorganizeKnowledgeTree(base.name, points, reorganizePrompt)
      for (const u of result.updates || []) {
        await updatePoint(u.id, {
          category: u.category,
          parent_category: u.parent_category || '',
          prerequisites: u.prerequisites || [],
          tags: u.tags || []
        })
      }
      await refresh()
      let msg = `✅ 已按你的要求重新梳理 ${(result.updates || []).length} 个知识点\n💡 ${result.insight || ''}`
      if (result.mergeSuggestions && result.mergeSuggestions.length > 0) {
        msg += `\n\n📌 额外建议：\n${result.mergeSuggestions.join('\n')}`
      }
      alert(msg)
      setShowReorganize(false)
      setReorganizePrompt('')
      setViewMode('tree')
    } catch (e) { alert('重新梳理失败：' + e.message) }
    setReorganizing(false)
  }

  // ---- AI 主动完善知识点 ----
  async function runExpand() {
    if (!aiConfigured) return alert('请先配置 DeepSeek Key')
    if (!editingPoint) return
    setExpanding(true)
    try {
      const result = await expandPoint(editingPoint, expandPrompt, base.name)
      setEditingPoint({
        ...editingPoint,
        content: result.content,
        tags: [...new Set([...(editingPoint.tags || []), ...(result.addedTags || [])])]
      })
      setExpandPrompt('')
    } catch (e) { alert('AI 完善失败：' + e.message) }
    setExpanding(false)
  }

  async function refresh() { setPoints(await listPoints(id)) }

  const categories = React.useMemo(() => {
    const map = new Map()
    for (const p of points) { const c = p.category || '未分类'; if (!map.has(c)) map.set(c, []); map.get(c).push(p) }
    return map
  }, [points])

  const knowledgeTree = React.useMemo(() => {
    const tree = new Map()
    for (const p of points) {
      const pc = p.parent_category || p.category || '未分类'
      const cc = p.category || '未分类'
      if (!tree.has(pc)) tree.set(pc, new Map())
      const cm = tree.get(pc)
      if (!cm.has(cc)) cm.set(cc, [])
      cm.get(cc).push(p)
    }
    return tree
  }, [points])

  if (!base) return <div className="loading">加载中…</div>

  return (
    <div className="base-view">
      <div className="base-header">
        <div className="base-header-top">
          <span className="base-icon-big">{base.icon}</span>
          <div><h1>{base.name}</h1>{base.description && <div className="base-desc">{base.description}</div>}</div>
        </div>
        <div className="base-stats">
          <span>📝 {points.length} 个知识点</span>
          <span>🗂️ {categories.size} 个主题</span>
        </div>
      </div>

      <div className="input-zone">
        <div className="input-mode-tabs">
          {['text', 'link', 'image', 'voice'].map(m => (
            <button key={m} className={inputMode === m ? 'active' : ''} onClick={() => setInputMode(m)}>
              {m === 'text' && '✍️ 文字'}{m === 'link' && '🔗 链接'}{m === 'image' && '🖼️ 图片'}{m === 'voice' && '🎙️ 语音'}
            </button>
          ))}
        </div>
        <div className="input-body">
          {inputMode === 'text' && (
            <>
              <textarea value={textDraft} onChange={e => setTextDraft(e.target.value)} placeholder="随手记点什么…也可以在下面附加一张图片（比如一篇有图有文字的文档截图）" rows={4} />
              <div
                className={`text-image-zone ${textImagePreview ? 'has-image' : ''}`}
                onDrop={handleTextImageDrop}
                onDragOver={handleTextImageDragOver}
                onClick={() => !textImagePreview && textImageRef.current?.click()}
              >
                {textImagePreview ? (
                  <div className="image-preview small">
                    <img src={textImagePreview} alt="附加图片" />
                    <button className="remove-image" onClick={e => { e.stopPropagation(); setTextImageFile(null); setTextImagePreview(null); if (textImageRef.current) textImageRef.current.value = '' }}>✕</button>
                  </div>
                ) : (
                  <div className="text-image-hint">📎 点击/拖拽/粘贴 附加一张图片（可选，会自动识别图中文字）</div>
                )}
                <input type="file" ref={textImageRef} accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleTextImageSelect(f) }} />
              </div>
            </>
          )}
          {inputMode === 'link' && <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)} placeholder="贴个链接…" />}
          {inputMode === 'image' && (
            <div ref={dropZoneRef} className={`drop-zone ${isDragging ? 'dragging' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={() => fileRef.current?.click()}>
              {imagePreview ? (
                <div className="image-preview"><img src={imagePreview} alt="预览" /><button className="remove-image" onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = '' }}>✕</button></div>
              ) : (
                <div className="drop-zone-content"><div className="drop-icon">🖼️</div><div className="drop-text"><strong>点击选择</strong>、<strong>拖拽图片</strong>、或<strong>粘贴</strong></div><div className="drop-hint">支持 JPG、PNG、GIF</div></div>
              )}
              <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleImageSelect(f) }} />
            </div>
          )}
          {inputMode === 'voice' && <div className="voice-hint">🎙️ 语音录制在下一版本支持</div>}
          <button className="primary" onClick={submitInput} disabled={ocrRunning}>
            {ocrRunning ? '⏳ 识别图片文字中…' : '💾 保存原始素材'}
          </button>
        </div>
      </div>

      <div className="action-bar">
        <button className="action-btn" onClick={processPending} disabled={processing}>
          {processing ? '⏳ AI 处理中…' : '🪄 让 AI 归纳未处理的笔记'}
        </button>
        {aiConfigured && <button className="action-btn" onClick={fetchSuggestions}>🔮 AI 建议我还缺什么</button>}
        {aiConfigured && points.length > 0 && (
          <button className="action-btn" onClick={() => setShowReorganize(true)}>🔄 用 AI 重新梳理知识树</button>
        )}
      </div>

      {showReorganize && (
        <div className="modal-mask" onClick={() => setShowReorganize(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>🔄 用 AI 重新梳理知识树</h2>
            <p className="muted">告诉 AI 你希望怎么整理，比如"按难度从低到高排列"、"把网络相关的知识点归到一个大类下"、"帮我找出重复的知识点"</p>
            <textarea value={reorganizePrompt} onChange={e => setReorganizePrompt(e.target.value)} placeholder="输入你的整理要求…" rows={4} />
            <div className="modal-actions">
              <button onClick={() => setShowReorganize(false)}>取消</button>
              <button className="primary" onClick={runReorganize} disabled={reorganizing}>
                {reorganizing ? '⏳ 梳理中…' : '✔️ 开始梳理'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuggest && (
        <div className="suggest-box">
          <div className="suggest-head"><h3>🔮 AI 建议补全的知识点</h3><button className="icon-btn" onClick={() => setShowSuggest(false)}>✕</button></div>
          {suggestions.length === 0 ? <div className="muted">AI 思考中…</div> :
            suggestions.map((s, i) => (
              <div key={i} className="suggest-item">
                <div className="suggest-title">📌 {s.title} <span className="tag">{s.category}</span></div>
                <div className="suggest-reason">{s.reason}</div>
                <div className="suggest-actions"><button className="primary" onClick={() => adoptSuggestion(s)}>✔️ 采纳并创建</button></div>
              </div>
            ))
          }
        </div>
      )}

      {points.length > 0 && (
        <div className="view-toggle">
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>📝 列表视图</button>
          <button className={viewMode === 'tree' ? 'active' : ''} onClick={() => setViewMode('tree')}>🌳 知识树</button>
        </div>
      )}

      {viewMode === 'list' && points.length > 0 && (
        <div className="point-list">
          <div className="cat-filter">
            <span className={filterCat === '' ? 'active' : ''} onClick={() => setFilterCat('')}>全部</span>
            {[...categories.keys()].map(c => <span key={c} className={filterCat === c ? 'active' : ''} onClick={() => setFilterCat(c)}>{c}</span>)}
          </div>
          {[...categories.entries()].filter(([c]) => !filterCat || c === filterCat).map(([cat, pts]) => (
            <div key={cat} className="cat-section">
              <h3 className="cat-title">📁 {cat} <span className="muted">({pts.length})</span></h3>
              {pts.map(p => (
                <div key={p.id} className={`point-card ${p.status === 'draft' ? 'draft' : ''}`}>
                  <div className="point-title">{p.title}{p.status === 'draft' && <span className="badge">草稿</span>}</div>
                  <div className="point-content">{p.content}</div>
                  <div className="point-tags">{(p.tags || []).map(t => <span key={t} className="tag">{t}</span>)}</div>
                  <div className="point-actions">
                    <button className="icon-btn" onClick={() => setEditingPoint(p)}>✏️ 编辑</button>
                    <button className="icon-btn" onClick={async () => { if (confirm('删除？')) { await deletePoint(p.id); await refresh() } }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {viewMode === 'tree' && points.length > 0 && (
        <div className="knowledge-tree">
          <h2 className="tree-title">🌳 知识体系</h2>
          {[...knowledgeTree.entries()].map(([pc, cm]) => (
            <div key={pc} className="tree-parent">
              <h3 className="parent-category">📚 {pc}</h3>
              {[...cm.entries()].map(([cc, pts]) => (
                <div key={cc} className="tree-child">
                  <h4 className="child-category">📁 {cc} ({pts.length})</h4>
                  <ul className="tree-points">
                    {pts.map(p => (
                      <li key={p.id} className="tree-point" onClick={() => setEditingPoint(p)}>
                        <div className="point-title">{p.title}
                          {p.difficulty && <span className={`difficulty-badge ${p.difficulty}`}>{p.difficulty === 'beginner' ? '入门' : p.difficulty === 'intermediate' ? '进阶' : '高级'}</span>}
                        </div>
                        {p.prerequisites && p.prerequisites.length > 0 && (
                          <div className="prerequisites"><span className="prereq-label">前置：</span>{p.prerequisites.map((pr, i) => <span key={i} className="prereq-tag">{pr}</span>)}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {points.length === 0 && !showSuggest && (<div className="empty"><div className="empty-icon">✍️</div><div>先用"随手记"记录素材，再让 AI 整理</div></div>)}

      {editingPoint && (
        <div className="modal-mask" onClick={() => { setEditingPoint(null); setExpandPrompt('') }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>编辑知识点</h2>
            <label>标题</label><input value={editingPoint.title} onChange={e => setEditingPoint({ ...editingPoint, title: e.target.value })} />
            <label>分类</label><input value={editingPoint.category || ''} onChange={e => setEditingPoint({ ...editingPoint, category: e.target.value })} />
            <label>内容</label><textarea value={editingPoint.content || ''} onChange={e => setEditingPoint({ ...editingPoint, content: e.target.value })} rows={8} />
            <label>标签（逗号分隔）</label><input value={(editingPoint.tags || []).join(',')} onChange={e => setEditingPoint({ ...editingPoint, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />

            {aiConfigured && (
              <div className="expand-zone">
                <label>🤖 让 AI 帮你完善这个知识点</label>
                <textarea value={expandPrompt} onChange={e => setExpandPrompt(e.target.value)} placeholder='比如"补充一个实际案例"、"讲得更深入一些"、"加上常见误区"（留空则默认全面补充）' rows={2} />
                <button className="action-btn" onClick={runExpand} disabled={expanding}>
                  {expanding ? '⏳ AI 完善中…' : '🤖 AI 帮我完善'}
                </button>
              </div>
            )}

            <div className="modal-actions">
              <button onClick={() => { setEditingPoint(null); setExpandPrompt('') }}>取消</button>
              <button className="primary" onClick={async () => {
                await updatePoint(editingPoint.id, { title: editingPoint.title, content: editingPoint.content, category: editingPoint.category, tags: editingPoint.tags })
                setEditingPoint(null); setExpandPrompt(''); await refresh()
              }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
