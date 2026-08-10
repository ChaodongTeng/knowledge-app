// AI 服务层 —— 可切换设计。目前接 DeepSeek，将来换模型只改这里。
const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY
const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'

export const aiConfigured = Boolean(API_KEY && !String(API_KEY).includes('你的'))

async function chat(messages, { json = false } = {}) {
  if (!aiConfigured) throw new Error('AI 未配置：请在 .env.local 填入 DeepSeek Key')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      ...(json ? { response_format: { type: 'json_object' } } : {})
    })
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`AI 请求失败 (${res.status}): ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}

// ============ 知识树归纳（核心升级） ============

/**
 * 批量归纳：把所有原始素材 + 已有知识点一起给 AI，
 * 让 AI 建立全局知识树（层级 + 关联）
 * 
 * @param {string} baseName 知识库名称
 * @param {Array} rawInputs 未处理的原始素材 [{id, raw_content, input_type}]
 * @param {Array} existingPoints 已有知识点 [{id, title, category}]
 * @returns {Object} { newPoints: [...], treeStructure: [...] }
 */
export async function buildKnowledgeTree(baseName, rawInputs, existingPoints = []) {
  // 构造已有知识点摘要
  const existingSummary = existingPoints.length > 0
    ? existingPoints.map(p => `  - [${p.id}] ${p.title}（${p.category || '未分类'}）`).join('\n')
    : '（暂无）'

  // 构造原始素材摘要
  const rawSummary = rawInputs.map((r, i) =>
    `  素材${i + 1}（${r.input_type}）: ${(r.raw_content || '').slice(0, 500)}`
  ).join('\n')

  const sys = `你是一个知识体系构建专家。用户正在学习《${baseName}》。

## 已有知识点
${existingSummary}

## 新的原始素材（待归纳）
${rawSummary}

## 你的任务

请完成以下工作：

### 1. 归纳新素材
把每条原始素材整理、抽象、归纳成结构化的知识点。不要简单复述原文，要：
- 提炼核心概念和原理
- 用清晰的书面语重写
- 抽象出可复用的知识，而非流水账

### 2. 构建知识层级
把所有知识点（包括已有的和新的）组织成层级结构：
- 识别大主题（作为父节点）
- 把相关知识点归到对应的父节点下
- 如果某知识点应该属于已有知识点的子节点，标注 parent_ref 指向已有知识点的 id

### 3. 建立关联
指出知识点之间的前置/后续关系、对比关系、因果关系等。

## 返回格式（严格 JSON）

{
  "newPoints": [
    {
      "title": "知识点标题",
      "content": "结构化的知识点内容，用书面语，可用小标题和要点",
      "category": "所属大主题",
      "tags": ["标签1", "标签2"],
      "parentCategory": "如果属于某个大主题下的子主题，填父主题名；否则为空",
      "prerequisites": ["学习这个之前应该先懂的知识点标题"],
      "connections": [{"target": "相关知识点标题", "relation": "关系类型：前置/延伸/对比/因果/包含"}]
    }
  ],
  "treeInsight": "对整个知识体系的一句话总结和建议，比如'你的知识集中在X领域，建议补充Y方向'"
}`

  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: '请帮我构建知识树。' }],
    { json: true }
  )
  return JSON.parse(out)
}

// ============ AI 重新梳理知识树（用户指导） ============

/**
 * 用户给出 prompt，让 AI 按照指定思路重新整理已有知识点的层级与关联
 */
export async function reorganizeKnowledgeTree(baseName, existingPoints, userPrompt) {
  const summary = existingPoints.map(p =>
    `  - [${p.id}] ${p.title}（分类：${p.category || '未分类'}，父类：${p.parent_category || '无'}）\n    内容摘要：${(p.content || '').slice(0, 150)}`
  ).join('\n')

  const sys = `你是知识体系架构师。用户正在整理《${baseName}》知识库。

## 当前所有知识点
${summary}

## 用户的整理要求
${userPrompt}

请按用户的要求重新组织这些知识点的层级和分类。对每个知识点，给出调整后的：
- id（原有 id，不能改变）
- category（子分类/主题）
- parent_category（大主题，可为空）
- prerequisites（前置知识点标题列表）
- tags

如果用户要求合并/拆分知识点，也可以在 mergeSuggestions 里说明（不自动执行，只建议）。

只返回严格 JSON：
{
  "updates": [{"id":"知识点id","category":"","parent_category":"","prerequisites":[],"tags":[]}],
  "insight": "整理思路的一句话说明",
  "mergeSuggestions": ["建议合并 A 和 B，因为..."]
}`

  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: '请帮我重新梳理。' }],
    { json: true }
  )
  return JSON.parse(out)
}

// ============ AI 主动完善知识点 ============

/**
 * 用户给出 prompt，让 AI 主动扩展/完善/深化某个知识点的内容
 */
export async function expandPoint(point, userPrompt, baseName) {
  const sys = `你是知识内容专家。用户正在完善《${baseName}》里的一个知识点。

## 当前知识点
标题：${point.title}
分类：${point.category || '未分类'}
现有内容：
${point.content || '（空）'}

## 用户的完善要求
${userPrompt || '请补充更完整、更深入的内容，包括原理、示例、易错点等'}

请基于现有内容，按用户要求扩展/完善/深化这个知识点的内容。保留原有正确内容，补充新内容，让其更完整、更有深度。

只返回严格 JSON：
{"content":"完善后的完整内容（书面语，可用小标题、要点、示例）","addedTags":["新增标签"]}`

  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: userPrompt || '请完善这个知识点' }],
    { json: true }
  )
  return JSON.parse(out)
}

// ============ 单条归纳（保留兼容） ============

export async function summarizeToPoint(rawText, baseName) {
  const sys = `你是一个知识整理专家。用户会给你一段随手记的原始素材（可能零散、口语化、不完整）。
你的任务：把它整理、抽象、归纳成一条清晰、结构化、可长期沉淀的"知识点"。
要求：
1. 提炼一个精准的标题（title）
2. 用条理清晰、可读性强的书面语重写内容（content），可用要点/小标题
3. 给出一个所属主题分类（category）
4. 给出 2-5 个关键词标签（tags 数组）
5. 给出前置知识 prerequisites（学习这个之前应该先懂的，数组，可为空）
所属知识库：《${baseName}》
只返回 JSON：{"title":"","content":"","category":"","tags":[],"prerequisites":[]}`
  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: rawText }],
    { json: true }
  )
  return JSON.parse(out)
}

// 针对某知识库，建议缺失/可补全的知识点
export async function suggestMissingPoints(baseName, existingPoints) {
  const existingSummary = existingPoints.length > 0
    ? existingPoints.map(p => `  - ${p.title}（${p.category || '未分类'}）${p.content ? '：' + p.content.slice(0, 100) : ''}`).join('\n')
    : '（暂无）'

  const sys = `你是一个学习路径规划专家。用户正在学习《${baseName}》领域。

## 已有知识点
${existingSummary}

请深度分析这个领域的知识体系，指出他还缺失的、重要的、应该补上的知识点（4-8 个），帮助他形成完整知识树。
每个建议要说明：
- 为什么该补（理由）
- 属于哪个大主题（category）
- 和哪些已有知识点有关联（如果有的话）
- 建议的学习顺序（order，1最先）

只返回 JSON：{"suggestions":[{"title":"","reason":"","category":"","relatedTo":[],"order":1}]}`
  const out = await chat([{ role: 'system', content: sys }], { json: true })
  return JSON.parse(out).suggestions
}

// 第二路：用户直接说想学什么，AI 生成整套知识点
export async function generateLearningPath(topic) {
  const sys = `你是一个学习专家。用户想系统学习一个主题，请为他生成一套结构化的入门知识点。
要求：
- 由浅入深、逻辑连贯
- 每个知识点包含：标题、完整内容、分类、标签
- 标注每个知识点的前置知识（在本列表内的标题）
- 整体形成一棵知识树

只返回 JSON：{"base_name":"知识库名","points":[{"title":"","content":"完整可读的知识点内容","category":"","tags":[],"prerequisites":[]}]}
生成 6-10 个知识点。`
  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: `我想学习：${topic}` }],
    { json: true }
  )
  return JSON.parse(out)
}
