# 简历智能筛选

一个本地运行的 DeepSeek 简历筛选 MVP。输入岗位职责，批量上传 PDF、DOCX、TXT 或 MD 简历，系统会抽取文本并生成候选人适配评分、匹配依据、风险提示和面试追问。

## 配置 DeepSeek

复制 `.env.example` 为 `.env`，填入你的 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

未配置 Key 时，应用会自动进入演示模式，仍可体验完整筛选流程。

## 配置数据库

应用会把账号、上传简历、解析报告和历史记录保存到后端数据库。默认使用 MySQL，适合继续用 Navicat 管理：

```bash
DATABASE_PROVIDER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=resume_screening_tool
```

启动服务时会自动创建数据库和业务表，并写入中文表/字段注释。

也可以切换到 Supabase Postgres：

```bash
DATABASE_PROVIDER=supabase
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_DB_SSL=true
```

当前 Supabase 项目可使用 `dfplrxdwmgjlysljaprd` 作为 `[PROJECT-REF]`。如果本地网络无法直连 IPv6，请在 Supabase Dashboard 的 Connect 面板复制 Supavisor Session pooler 连接串。数据库凭据只在 Node 后端读取，React 前端不会接触数据库密码或 service role key。

## 运行

```bash
npm install
npm run dev
```

启动后访问 `http://127.0.0.1:5173`。
