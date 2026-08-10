# 🧠 知识库 · 我的第二大脑

个人技能学习与知识沉淀系统 —— 一个完全自持的 PWA 应用。

## ✨ 核心特性

- 📚 **按知识域建库**：为每个学习领域创建专属知识库
- ✍️ **随手记**：文字、链接、图片、语音（转文字）任意输入
- 🤖 **AI 自动归纳**：把你的随手记整理成结构化知识点
- 🎯 **AI 建议补全**：分析知识体系，指出还缺什么
- 🌳 **智能分类**：自动按主题归类，形成知识树
- ⬇️ **一键导出**：数据永远是你的，随时可以带走
- 📱 **PWA**：可安装到手机/电脑主屏，像原生 App 一样使用

## 🚀 部署到 Vercel

### 1. 注册账号

- **Supabase**：https://supabase.com（用邮箱注册，创建项目）
- **DeepSeek**：https://platform.deepseek.com（注册并充值几块钱）
- **Vercel**：https://vercel.com（用 GitHub 登录）

### 2. Supabase 建表

在 Supabase 后台 → SQL Editor，执行 `database-schema.sql`。

然后创建 Storage Bucket：
- 左侧 **Storage** → **New bucket** → 名字 `media` → 勾选 **Public** → 创建

### 3. 获取配置信息

**Supabase**（Project Settings → API）：
- `Project URL`
- `anon public` key

**DeepSeek**（API Keys → Create）：
- API Key

### 4. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入：

```bash
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的anon-key
VITE_DEEPSEEK_API_KEY=你的deepseek-key
```

### 5. 部署

```bash
# 安装依赖
npm install

# 本地开发测试
npm run dev

# 构建生产版本
npm run build

# 部署到 Vercel
npx vercel --prod
```

按提示登录 Vercel 并选择项目，部署完成后会给你一个公网 URL。

### 6. 安装到手机

打开部署后的网址：
- **iPhone**：Safari → 分享 → 添加到主屏幕
- **Android**：Chrome → 菜单 → 添加到主屏幕
- **Mac**：Chrome → 菜单 → 更多工具 → 创建快捷方式

## 📦 技术栈

- **前端**：React + Vite
- **数据库**：Supabase（PostgreSQL）
- **AI**：DeepSeek API
- **部署**：Vercel（永久免费额度）
- **PWA**：可离线、可安装

## 🔐 数据所有权

- 代码完全开源（MIT License）
- 数据存在你自己的 Supabase
- 内置一键导出功能（JSON 格式）
- 随时可以迁移到自建服务器

## 📝 开发说明

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview
```

## 🛠️ 迁移指南

如果将来想完全脱离 Vercel：

1. `npm run build` 生成 `dist/` 目录
2. 把 `dist/` 部署到任何静态托管（GitHub Pages / Netlify / 自己服务器）
3. 数据仍在 Supabase，随时可导出迁移

## 📄 License

MIT - 你可以自由使用、修改、分发。
