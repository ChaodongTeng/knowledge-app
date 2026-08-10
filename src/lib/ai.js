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
      temperature: 0.4,
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

// 把随手记的原始输入，归纳成结构化知识点
export async function summarizeToPoint(rawText, baseName) {
  const sys = `你是一个知识整理专家。用户会给你一段随手记的原始素材（可能零散、口语化、不完整）。
你的任务：把它整理、抽象、归纳成一条清晰、结构化、可长期沉淀的"知识点"。
要求：
1. 提炼一个精准的标题（title）
2. 用条理清晰、可读性强的书面语重写内容（content），可用要点/小标题
3. 给出一个所属主题分类（category）
4. 给出 2-5 个关键词标签（tags 数组）
所属知识库：《${baseName}》
只返回 JSON：{"title":"","content":"","category":"","tags":[]}`
  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: rawText }],
    { json: true }
  )
  return JSON.parse(out)
}

// 针对某知识库，建议缺失/可补全的知识点
export async function suggestMissingPoints(baseName, existingTitles) {
  const sys = `你是一个学习路径规划专家。用户正在学习《${baseName}》领域。
以下是他已有的知识点标题列表：
${existingTitles.map(t => '- ' + t).join('\n') || '（暂无）'}
请分析这个领域的知识体系，指出他还缺失的、重要的、应该补上的知识点（3-6 个），帮助他形成完整知识树。
只返回 JSON：{"suggestions":[{"title":"","reason":"为什么该补这个","category":""}]}`
  const out = await chat([{ role: 'system', content: sys }], { json: true })
  return JSON.parse(out).suggestions
}

// 第二路：用户直接说想学什么，AI 生成整套知识点
export async function generateLearningPath(topic) {
  const sys = `你是一个学习专家。用户想系统学习一个主题，请为他生成一套结构化的入门知识点。
只返回 JSON：{"base_name":"知识库名","points":[{"title":"","content":"完整可读的知识点内容","category":"","tags":[]}]}
生成 5-8 个由浅入深、逻辑连贯的知识点。`
  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: `我想学习：${topic}` }],
    { json: true }
  )
  return JSON.parse(out)
}
