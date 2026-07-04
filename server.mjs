import { createServer } from "node:http";
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import mammoth from "mammoth";
import mysql from "mysql2/promise";
import pg from "pg";
import { PDFParse } from "pdf-parse";

const { Pool: PgPool } = pg;

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);

loadEnv();

const deepSeekConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "resume_screening_tool",
};
const postgresConfig = {
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "",
  ssl:
    (process.env.SUPABASE_DB_SSL || process.env.DATABASE_SSL || "true").toLowerCase() === "false"
      ? false
      : { rejectUnauthorized: false },
  max: Number(process.env.POSTGRES_CONNECTION_LIMIT || 10),
};
const databaseProvider = normalizeDatabaseProvider(process.env.DATABASE_PROVIDER);

const resumeParseTimeoutMs = Number(process.env.RESUME_PARSE_TIMEOUT_MS || 45000);
const deepSeekTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 60000);
const sessionCookieName = "resume_session";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const defaultWorkspace = {
  jobDescription: "",
  weights: {},
  files: [],
  candidates: [],
  selectedId: "",
};
const mysqlSchemaComments = [
  {
    name: "users",
    comment: "用户账号表",
    columns: {
      id: "用户主键ID",
      username: "登录账号，系统内唯一",
      password_hash: "密码哈希值",
      salt: "密码哈希盐值",
      created_at: "账号创建时间（ISO 字符串）",
    },
  },
  {
    name: "sessions",
    comment: "登录会话表",
    columns: {
      token: "登录会话令牌",
      user_id: "所属用户ID",
      created_at: "会话创建时间（ISO 字符串）",
      expires_at: "会话过期时间（ISO 字符串）",
    },
  },
  {
    name: "workspaces",
    comment: "用户当前工作台快照表",
    columns: {
      user_id: "工作台所属用户ID",
      job_description: "当前岗位需求文本",
      weights_json: "当前评分权重JSON",
      files_json: "当前上传简历快照JSON",
      candidates_json: "当前候选人分析结果JSON",
      selected_id: "当前选中候选人ID",
      updated_at: "工作台更新时间（ISO 字符串）",
    },
  },
  {
    name: "analysis_runs",
    comment: "历史分析报告快照表",
    columns: {
      id: "分析报告主键ID",
      user_id: "报告所属用户ID",
      title: "历史报告标题",
      job_description: "报告使用的岗位需求文本",
      weights_json: "报告使用的评分权重JSON",
      files_json: "报告使用的简历文件快照JSON",
      candidates_json: "报告生成的候选人结果JSON",
      selected_id: "报告默认选中候选人ID",
      source: "报告来源（deepseek/mock）",
      model: "生成报告使用的模型名称",
      summary_json: "报告汇总信息JSON",
      created_at: "报告创建时间（ISO 字符串）",
    },
  },
  {
    name: "schema_migrations",
    comment: "数据库迁移记录表",
    columns: {
      id: "迁移版本标识",
      applied_at: "迁移执行时间（ISO 字符串）",
    },
  },
  {
    name: "app_settings",
    comment: "应用配置表",
    columns: {
      key: "配置项键名",
      value: "配置项内容",
      updated_at: "配置更新时间（ISO 字符串）",
    },
  },
  {
    name: "job_profiles",
    comment: "岗位模板表",
    columns: {
      id: "岗位模板主键ID",
      user_id: "模板所属用户ID",
      title: "岗位模板名称",
      job_description: "岗位描述或招聘需求",
      weights_json: "岗位评分权重JSON",
      required_skills_json: "必备技能列表JSON",
      bonus_skills_json: "加分技能列表JSON",
      created_at: "模板创建时间（ISO 字符串）",
      updated_at: "模板更新时间（ISO 字符串）",
    },
  },
  {
    name: "resume_files",
    comment: "当前工作台简历文件表",
    columns: {
      id: "简历文件主键ID（用户ID与前端文件ID组合）",
      user_id: "文件所属用户ID",
      workspace_user_id: "关联工作台用户ID，空表示仅历史引用",
      original_file_id: "前端上传文件原始ID",
      name: "原始文件名",
      file_type: "浏览器识别的 MIME 类型",
      size: "文件大小（字节）",
      ext: "文件扩展名",
      data_base64: "原始文件 Base64 内容",
      status: "当前解析状态",
      parsed_text: "解析出的简历文本",
      created_at: "文件入库时间（ISO 字符串）",
      updated_at: "文件更新时间（ISO 字符串）",
    },
  },
  {
    name: "analysis_run_files",
    comment: "历史报告简历文件明细表",
    columns: {
      id: "报告文件记录主键ID",
      run_id: "所属分析报告ID",
      resume_file_id: "关联的当前工作台简历文件ID",
      original_file_id: "前端上传文件原始ID",
      name: "原始文件名",
      file_type: "浏览器识别的 MIME 类型",
      size: "文件大小（字节）",
      ext: "文件扩展名",
      status: "报告生成时的解析状态",
      parsed_text: "报告生成时的解析文本",
      sort_order: "文件在报告中的排序",
      created_at: "记录创建时间（ISO 字符串）",
    },
  },
  {
    name: "candidates",
    comment: "候选人分析结果表",
    columns: {
      id: "候选人记录主键ID",
      user_id: "候选人所属用户ID",
      run_id: "所属分析报告ID",
      candidate_key: "前端候选人ID或模型返回ID",
      name: "候选人姓名",
      title: "当前或最近职位",
      company: "当前或最近公司",
      years: "工作年限描述",
      education: "学历描述",
      location: "所在地区",
      file_name: "来源简历文件名",
      score: "综合匹配分",
      recommendation: "推荐结论",
      status: "招聘流程状态",
      salary: "薪资期望",
      availability: "到岗时间",
      sort_order: "候选人在报告中的排序",
      created_at: "记录创建时间（ISO 字符串）",
    },
  },
  {
    name: "candidate_breakdowns",
    comment: "候选人评分分项表",
    columns: {
      candidate_id: "候选人ID",
      skill_match: "技能匹配分",
      project_depth: "项目深度分",
      experience: "经验匹配分",
      education: "学历匹配分",
      soft_skills: "软技能分",
    },
  },
  {
    name: "candidate_tags",
    comment: "候选人标签表",
    columns: {
      id: "标签记录主键ID",
      candidate_id: "候选人ID",
      tag: "候选人标签",
      sort_order: "标签排序",
    },
  },
  {
    name: "candidate_strengths",
    comment: "候选人优势表",
    columns: {
      id: "优势记录主键ID",
      candidate_id: "候选人ID",
      content: "核心优势内容",
      sort_order: "优势排序",
    },
  },
  {
    name: "candidate_risks",
    comment: "候选人风险点表",
    columns: {
      id: "风险记录主键ID",
      candidate_id: "候选人ID",
      content: "风险提醒内容",
      sort_order: "风险排序",
    },
  },
  {
    name: "candidate_evidence",
    comment: "候选人评估证据表",
    columns: {
      id: "证据记录主键ID",
      candidate_id: "候选人ID",
      content: "评估证据内容",
      sort_order: "证据排序",
    },
  },
  {
    name: "candidate_questions",
    comment: "候选人面试问题表",
    columns: {
      id: "问题记录主键ID",
      candidate_id: "候选人ID",
      content: "面试问题内容",
      sort_order: "问题排序",
    },
  },
  {
    name: "audit_events",
    comment: "审计事件表",
    columns: {
      id: "审计事件主键ID",
      user_id: "关联用户ID，系统事件可为空",
      event_type: "事件类型",
      entity_type: "关联实体类型",
      entity_id: "关联实体ID",
      metadata_json: "事件附加信息JSON",
      created_at: "事件发生时间（ISO 字符串）",
    },
  },
];

const db = await initializeDatabase();

const vite = await createViteServer({
  root,
  server: { middlewareMode: true },
  appType: "spa",
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const databaseHealth = await getDatabaseHealth();
      sendJson(response, 200, {
        configured: Boolean(deepSeekConfig.apiKey),
        model: deepSeekConfig.model,
        baseUrl: deepSeekConfig.baseUrl,
        database: databaseHealth,
      });
      return;
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      const user = await getAuthenticatedUser(request);
      sendJson(response, 200, user ? await buildSessionPayload(user) : { user: null });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJsonBody(request);
      const user = await createUser(body);
      const token = await createSession(user.id);
      sendJson(response, 200, await buildSessionPayload(user), {
        "Set-Cookie": buildSessionCookie(token),
      });
      return;
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const user = await verifyLogin(body);
      const token = await createSession(user.id);
      sendJson(response, 200, await buildSessionPayload(user), {
        "Set-Cookie": buildSessionCookie(token),
      });
      return;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = getSessionToken(request);
      if (token) await deleteSession(token);
      sendJson(response, 200, { ok: true }, {
        "Set-Cookie": clearSessionCookie(),
      });
      return;
    }

    if (url.pathname === "/api/workspace" && request.method === "GET") {
      const user = await requireUser(request);
      sendJson(response, 200, await buildWorkspacePayload(user.id));
      return;
    }

    if (url.pathname === "/api/workspace" && request.method === "PUT") {
      const user = await requireUser(request);
      const body = await readJsonBody(request);
      await saveWorkspace(user.id, body);
      sendJson(response, 200, await buildWorkspacePayload(user.id));
      return;
    }

    const restoreMatch = url.pathname.match(/^\/api\/history\/([^/]+)\/restore$/);
    if (restoreMatch && request.method === "POST") {
      const user = await requireUser(request);
      const workspace = await restoreAnalysisRun(user.id, restoreMatch[1]);
      sendJson(response, 200, {
        workspace,
        history: await listHistory(user.id),
      });
      return;
    }

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      const user = await requireUser(request);
      const body = await readJsonBody(request);
      const analysis = await analyzeResumes(body);
      const savedWorkspace = await saveAnalysisResult(user.id, body, analysis);
      sendJson(response, 200, {
        ...analysis,
        workspace: savedWorkspace,
        history: await listHistory(user.id),
      });
      return;
    }

    vite.middlewares(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, error.status || 500, {
      message: error.message || "服务器处理失败",
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Resume screening studio running at http://127.0.0.1:${port}`);
});

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  const env = readFileSync(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeDatabaseProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["postgres", "postgresql", "supabase"].includes(normalized)) return "postgres";
  if (["mysql", "mariadb"].includes(normalized)) return "mysql";
  return postgresConfig.connectionString ? "postgres" : "mysql";
}

async function initializeDatabase() {
  if (databaseProvider === "postgres") {
    return initializePostgresDatabase();
  }

  return initializeMysqlDatabase();
}

async function initializeMysqlDatabase() {
  const databaseName = validateMysqlDatabaseName(mysqlConfig.database);
  let adminConnection;

  try {
    adminConnection = await mysql.createConnection({
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      charset: "utf8mb4",
    });
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } catch (error) {
    throw new Error(
      `MySQL 连接失败：${error.message}。请在 .env 中配置 MYSQL_HOST、MYSQL_PORT、MYSQL_USER、MYSQL_PASSWORD、MYSQL_DATABASE。`,
    );
  } finally {
    await adminConnection?.end().catch(() => {});
  }

  const pool = mysql.createPool({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: databaseName,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    maxIdle: 10,
    idleTimeout: 60000,
  });

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,
      salt VARCHAR(64) NOT NULL,
      created_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      expires_at VARCHAR(32) NOT NULL,
      INDEX idx_sessions_user_id (user_id),
      INDEX idx_sessions_expires_at (expires_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS workspaces (
      user_id VARCHAR(64) PRIMARY KEY,
      job_description LONGTEXT NOT NULL,
      weights_json LONGTEXT NOT NULL,
      files_json LONGTEXT NOT NULL,
      candidates_json LONGTEXT NOT NULL,
      selected_id VARCHAR(128) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      CONSTRAINT fk_workspaces_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS analysis_runs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      job_description LONGTEXT NOT NULL,
      weights_json LONGTEXT NOT NULL,
      files_json LONGTEXT NOT NULL,
      candidates_json LONGTEXT NOT NULL,
      selected_id VARCHAR(128) NOT NULL,
      source VARCHAR(32) NOT NULL,
      model VARCHAR(80) NOT NULL,
      summary_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      INDEX idx_analysis_runs_user_created (user_id, created_at),
      CONSTRAINT fk_analysis_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(128) PRIMARY KEY,
      applied_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      \`key\` VARCHAR(128) PRIMARY KEY,
      value LONGTEXT NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS job_profiles (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL,
      job_description LONGTEXT NOT NULL,
      weights_json LONGTEXT NOT NULL,
      required_skills_json LONGTEXT NOT NULL,
      bonus_skills_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      INDEX idx_job_profiles_user_updated (user_id, updated_at),
      CONSTRAINT fk_job_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS resume_files (
      id VARCHAR(160) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      workspace_user_id VARCHAR(64),
      original_file_id VARCHAR(160) NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_type VARCHAR(160) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      ext VARCHAR(32) NOT NULL,
      data_base64 LONGTEXT NOT NULL,
      status VARCHAR(160) NOT NULL,
      parsed_text LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      INDEX idx_resume_files_user_updated (user_id, updated_at),
      CONSTRAINT fk_resume_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_resume_files_workspace FOREIGN KEY (workspace_user_id) REFERENCES workspaces(user_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS analysis_run_files (
      id VARCHAR(64) PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL,
      resume_file_id VARCHAR(160),
      original_file_id VARCHAR(160) NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_type VARCHAR(160) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      ext VARCHAR(32) NOT NULL,
      status VARCHAR(160) NOT NULL,
      parsed_text LONGTEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL,
      INDEX idx_analysis_run_files_run (run_id, sort_order),
      CONSTRAINT fk_analysis_run_files_run FOREIGN KEY (run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE,
      CONSTRAINT fk_analysis_run_files_resume FOREIGN KEY (resume_file_id) REFERENCES resume_files(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidates (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      run_id VARCHAR(64) NOT NULL,
      candidate_key VARCHAR(128) NOT NULL,
      name VARCHAR(160) NOT NULL,
      title VARCHAR(160) NOT NULL,
      company VARCHAR(160) NOT NULL,
      years VARCHAR(80) NOT NULL,
      education VARCHAR(80) NOT NULL,
      location VARCHAR(120) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      recommendation VARCHAR(80) NOT NULL,
      status VARCHAR(80) NOT NULL,
      salary VARCHAR(120) NOT NULL,
      availability VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL,
      INDEX idx_candidates_run_score (run_id, score),
      INDEX idx_candidates_user_name (user_id, name),
      CONSTRAINT fk_candidates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_candidates_run FOREIGN KEY (run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_breakdowns (
      candidate_id VARCHAR(64) PRIMARY KEY,
      skill_match INT NOT NULL DEFAULT 0,
      project_depth INT NOT NULL DEFAULT 0,
      experience INT NOT NULL DEFAULT 0,
      education INT NOT NULL DEFAULT 0,
      soft_skills INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_candidate_breakdowns_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_tags (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      tag VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_candidate_tags_candidate (candidate_id, sort_order),
      CONSTRAINT fk_candidate_tags_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_strengths (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_candidate_strengths_candidate (candidate_id, sort_order),
      CONSTRAINT fk_candidate_strengths_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_risks (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_candidate_risks_candidate (candidate_id, sort_order),
      CONSTRAINT fk_candidate_risks_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_evidence (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_candidate_evidence_candidate (candidate_id, sort_order),
      CONSTRAINT fk_candidate_evidence_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS candidate_questions (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_candidate_questions_candidate (candidate_id, sort_order),
      CONSTRAINT fk_candidate_questions_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS audit_events (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      event_type VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      metadata_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      INDEX idx_audit_events_user_created (user_id, created_at),
      CONSTRAINT fk_audit_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }
  await pool.query("INSERT IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
    "001_full_project_schema",
    new Date().toISOString(),
  ]);
  await applySchemaComments(pool);
  await pool.query("INSERT IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
    "002_chinese_schema_comments",
    new Date().toISOString(),
  ]);

  return createMysqlAdapter(pool);
}

async function initializePostgresDatabase() {
  if (!postgresConfig.connectionString) {
    throw new Error(
      "Supabase/Postgres 连接失败：请在 .env 中配置 SUPABASE_DB_URL 或 DATABASE_URL，或把 DATABASE_PROVIDER 改为 mysql。",
    );
  }

  const pool = new PgPool({
    connectionString: postgresConfig.connectionString,
    ssl: postgresConfig.ssl,
    max: postgresConfig.max,
    application_name: "resume-screening-tool",
  });

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    await pool.end().catch(() => {});
    throw new Error(
      `Supabase/Postgres 连接失败：${error.message}。请检查 SUPABASE_DB_URL、数据库密码、SSL 和网络连接。`,
    );
  }

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,
      salt VARCHAR(64) NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at VARCHAR(32) NOT NULL,
      expires_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`,
    `CREATE TABLE IF NOT EXISTS workspaces (
      user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      job_description TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      files_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      selected_id VARCHAR(128) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS analysis_runs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      job_description TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      files_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      selected_id VARCHAR(128) NOT NULL,
      source VARCHAR(32) NOT NULL,
      model VARCHAR(80) NOT NULL,
      summary_json TEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_analysis_runs_user_created ON analysis_runs (user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(128) PRIMARY KEY,
      applied_at VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      "key" VARCHAR(128) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS job_profiles (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      job_description TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      required_skills_json TEXT NOT NULL,
      bonus_skills_json TEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_job_profiles_user_updated ON job_profiles (user_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS resume_files (
      id VARCHAR(160) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_user_id VARCHAR(64) REFERENCES workspaces(user_id) ON DELETE SET NULL,
      original_file_id VARCHAR(160) NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_type VARCHAR(160) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      ext VARCHAR(32) NOT NULL,
      data_base64 TEXT NOT NULL,
      status VARCHAR(160) NOT NULL,
      parsed_text TEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_resume_files_user_updated ON resume_files (user_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_resume_files_workspace_user_id ON resume_files (workspace_user_id)`,
    `CREATE TABLE IF NOT EXISTS analysis_run_files (
      id VARCHAR(64) PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      resume_file_id VARCHAR(160) REFERENCES resume_files(id) ON DELETE SET NULL,
      original_file_id VARCHAR(160) NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_type VARCHAR(160) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      ext VARCHAR(32) NOT NULL,
      status VARCHAR(160) NOT NULL,
      parsed_text TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_analysis_run_files_run ON analysis_run_files (run_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_analysis_run_files_resume_file_id ON analysis_run_files (resume_file_id)`,
    `CREATE TABLE IF NOT EXISTS candidates (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      run_id VARCHAR(64) NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      candidate_key VARCHAR(128) NOT NULL,
      name VARCHAR(160) NOT NULL,
      title VARCHAR(160) NOT NULL,
      company VARCHAR(160) NOT NULL,
      years VARCHAR(80) NOT NULL,
      education VARCHAR(80) NOT NULL,
      location VARCHAR(120) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      recommendation VARCHAR(80) NOT NULL,
      status VARCHAR(80) NOT NULL,
      salary VARCHAR(120) NOT NULL,
      availability VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidates_run_score ON candidates (run_id, score)`,
    `CREATE INDEX IF NOT EXISTS idx_candidates_user_name ON candidates (user_id, name)`,
    `CREATE TABLE IF NOT EXISTS candidate_breakdowns (
      candidate_id VARCHAR(64) PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
      skill_match INT NOT NULL DEFAULT 0,
      project_depth INT NOT NULL DEFAULT 0,
      experience INT NOT NULL DEFAULT 0,
      education INT NOT NULL DEFAULT 0,
      soft_skills INT NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS candidate_tags (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      tag VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON candidate_tags (candidate_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS candidate_strengths (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidate_strengths_candidate ON candidate_strengths (candidate_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS candidate_risks (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidate_risks_candidate ON candidate_risks (candidate_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS candidate_evidence (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidate_evidence_candidate ON candidate_evidence (candidate_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS candidate_questions (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_candidate_questions_candidate ON candidate_questions (candidate_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS audit_events (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events (user_id, created_at)`,
  ];

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }

  await recordPostgresMigration(pool, "001_full_project_schema");
  if (!(await hasPostgresMigration(pool, "002_chinese_schema_comments"))) {
    await applyPostgresSecurity(pool);
    await applyPostgresComments(pool);
    await recordPostgresMigration(pool, "002_chinese_schema_comments");
  }

  return createPostgresAdapter(pool);
}

async function hasPostgresMigration(pool, id) {
  const result = await pool.query("SELECT id FROM schema_migrations WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function recordPostgresMigration(pool, id) {
  await pool.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [
    id,
    new Date().toISOString(),
  ]);
}

async function applyPostgresSecurity(pool) {
  const tableNames = mysqlSchemaComments.map((table) => table.name);
  for (const tableName of tableNames) {
    const quotedName = quotePostgresIdentifier(tableName);
    await pool.query(`ALTER TABLE ${quotedName} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`REVOKE ALL ON TABLE ${quotedName} FROM anon, authenticated`);
  }

  await pool.query("REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated");
}

async function applyPostgresComments(pool) {
  for (const table of mysqlSchemaComments) {
    await pool.query(`COMMENT ON TABLE ${quotePostgresIdentifier(table.name)} IS ${quotePostgresString(table.comment)}`);

    for (const [columnName, comment] of Object.entries(table.columns)) {
      await pool.query(
        `COMMENT ON COLUMN ${quotePostgresIdentifier(table.name)}.${quotePostgresIdentifier(
          columnName,
        )} IS ${quotePostgresString(comment)}`,
      );
    }
  }
}

async function applySchemaComments(pool) {
  for (const table of mysqlSchemaComments) {
    await pool.query(
      `ALTER TABLE ${quoteMysqlIdentifier(table.name)} COMMENT = ${quoteMysqlString(table.comment)}`,
    );

    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table.name],
    );
    const columnsByName = new Map(columns.map((column) => [column.COLUMN_NAME, column]));

    for (const [columnName, comment] of Object.entries(table.columns)) {
      const column = columnsByName.get(columnName);
      if (!column) continue;

      await pool.query(
        `ALTER TABLE ${quoteMysqlIdentifier(table.name)}
         MODIFY COLUMN ${quoteMysqlIdentifier(columnName)} ${buildMysqlColumnDefinition(column)}
         COMMENT ${quoteMysqlString(comment)}`,
      );
    }
  }
}

function buildMysqlColumnDefinition(column) {
  const charsetClause = column.CHARACTER_SET_NAME
    ? ` CHARACTER SET ${quoteMysqlIdentifier(column.CHARACTER_SET_NAME)} COLLATE ${quoteMysqlIdentifier(
        column.COLLATION_NAME,
      )}`
    : "";
  const nullClause = column.IS_NULLABLE === "YES" ? " NULL" : " NOT NULL";
  const defaultClause = column.COLUMN_DEFAULT === null ? "" : ` DEFAULT ${quoteMysqlString(column.COLUMN_DEFAULT)}`;
  const extraClause = column.EXTRA ? ` ${column.EXTRA}` : "";
  return `${column.COLUMN_TYPE}${charsetClause}${nullClause}${defaultClause}${extraClause}`;
}

function quoteMysqlIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value || "")) {
    throw new Error(`MySQL 标识符不合法：${value}`);
  }
  return `\`${value}\``;
}

function quoteMysqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function validateMysqlDatabaseName(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error("MYSQL_DATABASE 只能包含字母、数字和下划线");
  }
  return name;
}

function createMysqlAdapter(pool) {
  return {
    provider: "mysql",
    async execute(sql, params = []) {
      return pool.execute(sql, params);
    },
    async query(sql, params = []) {
      return pool.query(sql, params);
    },
    async ping() {
      await pool.query("SELECT 1");
    },
  };
}

function createPostgresAdapter(pool) {
  return {
    provider: "supabase",
    async execute(sql, params = []) {
      const result = await pool.query(toPostgresQuery(sql), params);
      return [result.rows, result];
    },
    async query(sql, params = []) {
      const result = await pool.query(toPostgresQuery(sql), params);
      return [result.rows, result];
    },
    async ping() {
      await pool.query("SELECT 1");
    },
  };
}

function toPostgresQuery(sql) {
  let parameterIndex = 0;
  return sql.replace(/\?/g, () => `$${++parameterIndex}`);
}

function quotePostgresIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value || "")) {
    throw new Error(`Postgres 标识符不合法：${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function quotePostgresString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function getDatabaseHealth() {
  try {
    await db.ping();
    return {
      provider: db.provider,
      connected: true,
    };
  } catch (error) {
    return {
      provider: db.provider,
      connected: false,
      message: error.message,
    };
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function normalizeUsername(username = "") {
  return String(username).trim().toLowerCase();
}

function validateCredentials({ username, password }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = String(password || "");

  if (normalizedUsername.length < 2 || normalizedUsername.length > 40 || /\s/.test(normalizedUsername)) {
    throw new HttpError(400, "账号需为 2-40 个非空白字符");
  }

  if (normalizedPassword.length < 6 || normalizedPassword.length > 72) {
    throw new HttpError(400, "密码需为 6-72 个字符");
  }

  return {
    username: normalizedUsername,
    password: normalizedPassword,
  };
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
}

async function firstRow(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0] || null;
}

async function allRows(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function createUser(credentials) {
  const { username, password } = validateCredentials(credentials);
  const existing = await firstRow("SELECT id FROM users WHERE username = ?", [username]);
  if (existing) throw new HttpError(409, "该账号已存在，请直接登录");

  const id = randomUUID();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const createdAt = new Date().toISOString();

  await db.execute("INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    username,
    passwordHash,
    salt,
    createdAt,
  ]);
  await saveWorkspace(id, defaultWorkspace);

  return { id, username, createdAt };
}

async function verifyLogin(credentials) {
  const { username, password } = validateCredentials(credentials);
  const user = await firstRow("SELECT * FROM users WHERE username = ?", [username]);
  if (!user) throw new HttpError(401, "账号或密码不正确");

  const expected = Buffer.from(user.password_hash, "hex");
  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new HttpError(401, "账号或密码不正确");
  }

  return { id: user.id, username: user.username, createdAt: user.created_at };
}

async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlMs);

  await db.execute("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    token,
    userId,
    now.toISOString(),
    expiresAt.toISOString(),
  ]);
  return token;
}

async function deleteSession(token) {
  await db.execute("DELETE FROM sessions WHERE token = ?", [token]);
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separatorIndex = item.indexOf("=");
        if (separatorIndex === -1) return [item, ""];
        return [item.slice(0, separatorIndex), decodeURIComponent(item.slice(separatorIndex + 1))];
      }),
  );
}

function getSessionToken(request) {
  return parseCookies(request)[sessionCookieName] || "";
}

function buildSessionCookie(token) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.round(
    sessionTtlMs / 1000,
  )}`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

async function getAuthenticatedUser(request) {
  const token = getSessionToken(request);
  if (!token) return null;

  const row = await firstRow(
    `SELECT users.id, users.username, users.created_at, sessions.expires_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`,
    [token],
  );

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };
}

async function requireUser(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw new HttpError(401, "请先登录后再继续");
  return user;
}

function jsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeWorkspacePayload(payload = {}) {
  return {
    jobDescription: String(payload.jobDescription || ""),
    weights: payload.weights && typeof payload.weights === "object" ? payload.weights : {},
    files: Array.isArray(payload.files) ? payload.files : [],
    candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
    selectedId: String(payload.selectedId || payload.candidates?.[0]?.id || ""),
  };
}

async function saveWorkspace(userId, payload = {}) {
  const workspace = sanitizeWorkspacePayload(payload);
  const updatedAt = new Date().toISOString();

  await upsertWorkspace(userId, workspace, updatedAt);
  await syncWorkspaceFiles(userId, workspace.files, updatedAt);

  return {
    ...workspace,
    updatedAt,
  };
}

async function upsertWorkspace(userId, workspace, updatedAt) {
  const values = [
    userId,
    workspace.jobDescription,
    JSON.stringify(workspace.weights),
    JSON.stringify(workspace.files),
    JSON.stringify(workspace.candidates),
    workspace.selectedId,
    updatedAt,
  ];

  if (db.provider === "supabase") {
    await db.execute(
      `INSERT INTO workspaces (
        user_id, job_description, weights_json, files_json, candidates_json, selected_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        job_description = EXCLUDED.job_description,
        weights_json = EXCLUDED.weights_json,
        files_json = EXCLUDED.files_json,
        candidates_json = EXCLUDED.candidates_json,
        selected_id = EXCLUDED.selected_id,
        updated_at = EXCLUDED.updated_at`,
      values,
    );
    return;
  }

  await db.execute(
    `INSERT INTO workspaces (
      user_id, job_description, weights_json, files_json, candidates_json, selected_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      job_description = VALUES(job_description),
      weights_json = VALUES(weights_json),
      files_json = VALUES(files_json),
      candidates_json = VALUES(candidates_json),
      selected_id = VALUES(selected_id),
      updated_at = VALUES(updated_at)`,
    values,
  );
}

async function syncWorkspaceFiles(userId, files = [], updatedAt = new Date().toISOString()) {
  await db.execute("DELETE FROM resume_files WHERE workspace_user_id = ?", [userId]);

  const insertFileSql = `INSERT INTO resume_files (
      id, user_id, workspace_user_id, original_file_id, name, file_type, size, ext,
      data_base64, status, parsed_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const file of files) {
    await db.execute(insertFileSql, [
      `${userId}:${file.id}`,
      userId,
      userId,
      String(file.id || ""),
      String(file.name || "未命名简历"),
      String(file.type || ""),
      Number(file.size) || 0,
      String(file.ext || ""),
      String(file.data || ""),
      String(file.status || "已就绪"),
      String(file.parsedText || ""),
      updatedAt,
      updatedAt,
    ]);
  }
}

async function getWorkspace(userId) {
  const row = await firstRow("SELECT * FROM workspaces WHERE user_id = ?", [userId]);
  if (!row) return { ...defaultWorkspace, updatedAt: "" };

  return {
    jobDescription: row.job_description,
    weights: jsonParse(row.weights_json, {}),
    files: jsonParse(row.files_json, []),
    candidates: jsonParse(row.candidates_json, []),
    selectedId: row.selected_id,
    updatedAt: row.updated_at,
  };
}

async function buildSessionPayload(user) {
  return {
    user,
    ...(await buildWorkspacePayload(user.id)),
  };
}

async function buildWorkspacePayload(userId) {
  return {
    workspace: await getWorkspace(userId),
    history: await listHistory(userId),
  };
}

function mergeAnalyzedFiles(files = [], extractedFiles = []) {
  return files.map((file) => {
    const parsed = extractedFiles.find((item) => item.id === file.id || item.name === file.name);
    return {
      ...file,
      status: parsed?.status || file.status || "解析完成",
      parsedText: parsed?.text || file.parsedText || "",
    };
  });
}

async function saveAnalysisResult(userId, requestBody, analysis) {
  const candidates = Array.isArray(analysis.candidates) ? analysis.candidates : [];
  const selectedId = candidates[0]?.id || "";
  const files = mergeAnalyzedFiles(requestBody.files, analysis.extractedFiles);
  const workspace = await saveWorkspace(userId, {
    jobDescription: requestBody.jobDescription,
    weights: requestBody.weights,
    files,
    candidates,
    selectedId,
  });
  await createAnalysisRun(userId, {
    ...workspace,
    summary: analysis.summary,
    source: analysis.source,
    model: analysis.model,
  });
  return workspace;
}

async function createAnalysisRun(userId, payload) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const candidateCount = payload.candidates.length;
  const strongestCandidate = payload.summary?.strongestCandidate || payload.candidates[0]?.name || "未命名报告";
  const title = `${strongestCandidate} 等 ${candidateCount} 人适配报告`;

  await db.execute(
    `INSERT INTO analysis_runs (
      id, user_id, title, job_description, weights_json, files_json, candidates_json,
      selected_id, source, model, summary_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      title,
      payload.jobDescription,
      JSON.stringify(payload.weights),
      JSON.stringify(payload.files),
      JSON.stringify(payload.candidates),
      payload.selectedId,
      payload.source || "mock",
      payload.model || deepSeekConfig.model,
      JSON.stringify(payload.summary || {}),
      createdAt,
    ],
  );
  await syncAnalysisRunDetails(userId, id, payload, createdAt);

  return id;
}

async function syncAnalysisRunDetails(userId, runId, payload, createdAt = new Date().toISOString()) {
  const insertRunFileSql = `INSERT INTO analysis_run_files (
      id, run_id, resume_file_id, original_file_id, name, file_type, size, ext,
      status, parsed_text, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const [index, file] of (payload.files || []).entries()) {
    await db.execute(insertRunFileSql, [
      randomUUID(),
      runId,
      `${userId}:${file.id}`,
      String(file.id || ""),
      String(file.name || "未命名简历"),
      String(file.type || ""),
      Number(file.size) || 0,
      String(file.ext || ""),
      String(file.status || ""),
      String(file.parsedText || ""),
      index,
      createdAt,
    ]);
  }

  const insertCandidateSql = `INSERT INTO candidates (
      id, user_id, run_id, candidate_key, name, title, company, years, education,
      location, file_name, score, recommendation, status, salary, availability,
      sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const insertBreakdownSql = `INSERT INTO candidate_breakdowns (
      candidate_id, skill_match, project_depth, experience, education, soft_skills
    ) VALUES (?, ?, ?, ?, ?, ?)`;

  for (const [index, candidate] of (payload.candidates || []).entries()) {
    const candidateId = randomUUID();
    await db.execute(insertCandidateSql, [
      candidateId,
      userId,
      runId,
      String(candidate.id || ""),
      String(candidate.name || `候选人 ${index + 1}`),
      String(candidate.title || ""),
      String(candidate.company || ""),
      String(candidate.years || ""),
      String(candidate.education || ""),
      String(candidate.location || ""),
      String(candidate.fileName || ""),
      clampScore(candidate.score),
      String(candidate.recommendation || ""),
      String(candidate.status || ""),
      String(candidate.salary || ""),
      String(candidate.availability || ""),
      index,
      createdAt,
    ]);

    await db.execute(insertBreakdownSql, [
      candidateId,
      clampScore(candidate.breakdown?.skillMatch),
      clampScore(candidate.breakdown?.projectDepth),
      clampScore(candidate.breakdown?.experience),
      clampScore(candidate.breakdown?.education),
      clampScore(candidate.breakdown?.softSkills),
    ]);

    await insertCandidateList("candidate_tags", "tag", candidateId, candidate.tags);
    await insertCandidateList("candidate_strengths", "content", candidateId, candidate.strengths);
    await insertCandidateList("candidate_risks", "content", candidateId, candidate.risks);
    await insertCandidateList("candidate_evidence", "content", candidateId, candidate.evidence);
    await insertCandidateList("candidate_questions", "content", candidateId, candidate.questions);
  }
}

async function insertCandidateList(tableName, columnName, candidateId, values = []) {
  if (!Array.isArray(values) || values.length === 0) return;
  const sql = `INSERT INTO ${tableName} (id, candidate_id, ${columnName}, sort_order) VALUES (?, ?, ?, ?)`;

  for (const [index, value] of values.filter(Boolean).entries()) {
    await db.execute(sql, [randomUUID(), candidateId, String(value), index]);
  }
}

async function listHistory(userId) {
  const rows = await allRows(
    `SELECT id, title, source, model, summary_json, created_at
     FROM analysis_runs
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );
  return rows.map((row) => {
    const summary = jsonParse(row.summary_json, {});
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      model: row.model,
      createdAt: row.created_at,
      recommendedCount: summary.recommendedCount || 0,
      averageScore: summary.averageScore || 0,
      strongestCandidate: summary.strongestCandidate || "",
    };
  });
}

async function restoreAnalysisRun(userId, runId) {
  const row = await firstRow("SELECT * FROM analysis_runs WHERE user_id = ? AND id = ?", [userId, runId]);
  if (!row) throw new HttpError(404, "未找到这条历史报告");

  return saveWorkspace(userId, {
    jobDescription: row.job_description,
    weights: jsonParse(row.weights_json, {}),
    files: jsonParse(row.files_json, []),
    candidates: jsonParse(row.candidates_json, []),
    selectedId: row.selected_id,
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) {
        reject(new Error("上传内容过大，请拆分批次后重试"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求格式不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function analyzeResumes({ jobDescription = "", weights = {}, files = [] }) {
  const extractedFiles = await Promise.all(files.map(extractResumeText));
  const usableFiles = extractedFiles.filter((file) => file.text?.trim());

  if (!deepSeekConfig.apiKey) {
    return {
      source: "mock",
      model: deepSeekConfig.model,
      extractedFiles,
      ...buildMockAnalysis(jobDescription, weights, usableFiles),
    };
  }

  try {
    const deepSeekResult = await callDeepSeek(jobDescription, weights, usableFiles);
    return {
      source: "deepseek",
      model: deepSeekConfig.model,
      extractedFiles,
      summary: deepSeekResult.summary || buildSummaryFromCandidates(deepSeekResult.candidates),
      candidates: normalizeDeepSeekCandidates(deepSeekResult.candidates, usableFiles),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("DeepSeek request failed, falling back to mock analysis:", error);
    const fallbackStatus = /超时|timeout|abort/i.test(error.message || "")
      ? "DeepSeek 响应超时，已生成演示报告"
      : "DeepSeek 调用失败，已生成演示报告";
    return {
      source: "mock",
      model: deepSeekConfig.model,
      extractedFiles: extractedFiles.map((file) => ({
        ...file,
        status: file.status === "解析完成" ? fallbackStatus : file.status,
      })),
      ...buildMockAnalysis(jobDescription, weights, usableFiles),
    };
  }
}

async function extractResumeText(file) {
  const extension = (file.ext || extname(file.name).replace(".", "") || "").toLowerCase();
  const buffer = Buffer.from(file.data || "", "base64");

  try {
    if (!buffer.length) {
      return { ...fileMeta(file), status: "文件为空", text: "" };
    }

    if (extension === "docx") {
      const result = await withTimeout(
        mammoth.extractRawText({ buffer }),
        resumeParseTimeoutMs,
        `DOCX 解析超时：超过 ${formatDuration(resumeParseTimeoutMs)}`,
      );
      return { ...fileMeta(file), status: "解析完成", text: limitText(cleanText(result.value)) };
    }

    if (extension === "pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await withTimeout(
          parser.getText(),
          resumeParseTimeoutMs,
          `PDF 解析超时：超过 ${formatDuration(resumeParseTimeoutMs)}`,
          () => parser.destroy().catch(() => {}),
        );
        return { ...fileMeta(file), status: "解析完成", text: limitText(cleanText(result.text)) };
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    if (["txt", "md", "markdown"].includes(extension) || file.type?.startsWith("text/")) {
      return { ...fileMeta(file), status: "解析完成", text: limitText(cleanText(buffer.toString("utf8"))) };
    }

    return { ...fileMeta(file), status: "暂不支持该格式", text: "" };
  } catch (error) {
    return { ...fileMeta(file), status: `解析失败：${error.message}`, text: "" };
  }
}

function fileMeta(file) {
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    ext: file.ext,
  };
}

function cleanText(value = "") {
  return value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function limitText(value) {
  return value.slice(0, 14000);
}

function withTimeout(promise, milliseconds, message, onTimeout) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, milliseconds);

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function formatDuration(milliseconds) {
  return `${Math.round(milliseconds / 1000)} 秒`;
}

async function callDeepSeek(jobDescription, weights, files) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), deepSeekTimeoutMs);
  let response;

  try {
    response = await fetch(`${deepSeekConfig.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${deepSeekConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deepSeekConfig.model,
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是资深招聘专家、技术面试官和人才评估顾问。你必须只输出严格 JSON，不要 Markdown，不要解释。",
          },
          {
            role: "user",
            content: buildDeepSeekPrompt(jobDescription, weights, files),
          },
        ],
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`DeepSeek 响应超时：超过 ${formatDuration(deepSeekTimeoutMs)}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回内容为空");
  return JSON.parse(content);
}

function buildDeepSeekPrompt(jobDescription, weights, files) {
  const resumePayload = files.map((file, index) => ({
    index: index + 1,
    fileName: file.name,
    text: file.text,
  }));

  return JSON.stringify(
    {
      task: "根据岗位职责与简历文本，输出候选人适配报告和评分。",
      jobDescription,
      scoringWeights: weights,
      outputSchema: {
        summary: {
          recommendedCount: "number",
          averageScore: "number",
          strongestCandidate: "string",
          mainRisk: "string",
        },
        candidates: [
          {
            id: "string",
            name: "string",
            title: "string",
            company: "string",
            years: "string",
            education: "string",
            location: "string",
            fileName: "string",
            score: "0-100 integer",
            recommendation: "强烈推荐 | 推荐 | 可面试 | 待复核 | 不推荐",
            status: "强匹配 | 可面试 | 待复核 | 不推荐",
            tags: ["string"],
            salary: "string",
            availability: "string",
            breakdown: {
              skillMatch: "0-100 integer",
              projectDepth: "0-100 integer",
              experience: "0-100 integer",
              education: "0-100 integer",
              softSkills: "0-100 integer",
            },
            strengths: ["string"],
            risks: ["string"],
            evidence: ["string"],
            questions: ["string"],
          },
        ],
      },
      rules: [
        "只根据简历证据判断，不要编造不存在的信息。",
        "如果简历缺少姓名，可从文件名推断，但要保持谨慎。",
        "evidence 必须引用简历中的经历或技能证据。",
        "risks 必须指出与岗位要求的差距或需要面试验证的事项。",
        "questions 必须是可用于技术面试的追问。",
        "输出必须是严格 JSON，字段名必须匹配 outputSchema。",
      ],
      resumes: resumePayload,
    },
    null,
    2,
  );
}

function normalizeDeepSeekCandidates(candidates = [], files = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return buildMockAnalysis("", {}, files).candidates;
  }

  return candidates
    .map((candidate, index) => {
      const score = clampScore(candidate.score ?? 0);
      return {
        id: candidate.id || `deepseek-${index + 1}`,
        name: candidate.name || inferName(files[index]?.name) || `候选人 ${index + 1}`,
        title: candidate.title || "候选人",
        company: candidate.company || "未提及公司",
        years: candidate.years || "未提及",
        education: candidate.education || "未提及",
        location: candidate.location || "未提及",
        fileName: candidate.fileName || files[index]?.name || "",
        score,
        recommendation: candidate.recommendation || recommendationFromScore(score),
        status: candidate.status || statusFromScore(score),
        tags: Array.isArray(candidate.tags) ? candidate.tags.slice(0, 8) : [],
        salary: candidate.salary || "简历未提及",
        availability: candidate.availability || "待沟通",
        breakdown: normalizeBreakdown(candidate.breakdown, score),
        strengths: normalizeList(candidate.strengths),
        risks: normalizeList(candidate.risks),
        evidence: normalizeList(candidate.evidence),
        questions: normalizeList(candidate.questions),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildMockAnalysis(jobDescription, weights, files) {
  const sourceFiles = files.length ? files : [{ name: "张磊_高级后端工程师.pdf", text: jobDescription }];
  const candidates = sourceFiles.map((file, index) => {
    const text = `${file.name} ${file.text || ""}`;
    const score = mockScore(text, index);
    const skills = detectSkills(text);
    const name = inferName(file.name) || ["张磊", "李明", "孙洁", "吴磊", "刘洋"][index % 5];
    return {
      id: file.id || `mock-${index + 1}`,
      name,
      title: detectTitle(text),
      company: detectCompany(index),
      years: detectYears(text, index),
      education: detectEducation(text),
      location: detectLocation(text, index),
      fileName: file.name,
      score,
      recommendation: recommendationFromScore(score),
      status: statusFromScore(score),
      tags: skills,
      salary: ["32K-45K / 15薪", "25K-35K / 14薪", "28K-38K / 14薪", "22K-30K / 13薪"][index % 4],
      availability: ["2 周内到岗", "15 天", "1 个月", "待沟通"][index % 4],
      breakdown: normalizeBreakdown(
        {
          skillMatch: score + 3,
          projectDepth: score - 4,
          experience: score - 2,
          education: score - 6,
          softSkills: score - 3,
        },
        score,
      ),
      strengths: [
        `简历中覆盖 ${skills.slice(0, 3).join("、") || "岗位相关技能"}，与岗位核心要求匹配。`,
        "具备较完整的项目交付描述，可进一步验证其职责边界。",
        "从经历描述看，具备独立推进模块开发与问题排查能力。",
      ],
      risks:
        score >= 80
          ? ["部分关键指标缺少量化结果，建议面试追问业务规模和性能数据。"]
          : ["高并发或系统设计经验描述不足，需要面试确认真实深度。", "与岗位必备技能仍有差距，建议谨慎推进。"],
      evidence: [
        "简历文本中出现后端研发、接口设计、数据库或缓存等岗位相关信息。",
        "项目经历体现了需求理解、开发实现和线上问题处理能力。",
        "技能关键词与岗位职责存在交集，可进入结构化面试验证。",
      ],
      questions: [
        "请选一个你最熟悉的后端项目，说明系统边界、核心表设计和性能指标。",
        "遇到接口响应慢时，你会按什么顺序定位问题？",
        "如果业务量提升 10 倍，你会优先改造哪些模块？",
      ],
    };
  });

  return {
    summary: buildSummaryFromCandidates(candidates),
    candidates: candidates.sort((a, b) => b.score - a.score),
    generatedAt: new Date().toISOString(),
    weights,
  };
}

function mockScore(text, index) {
  const keywords = ["java", "spring", "mysql", "redis", "kafka", "微服务", "分布式", "高并发", "系统设计"];
  const lowered = text.toLowerCase();
  const hits = keywords.reduce((sum, keyword) => sum + (lowered.includes(keyword.toLowerCase()) ? 1 : 0), 0);
  return Math.max(54, Math.min(96, 66 + hits * 4 + (index % 4) * 2));
}

function detectSkills(text = "") {
  const skills = ["Java", "Spring Boot", "Spring Cloud", "MySQL", "Redis", "Kafka", "Docker", "K8s", "微服务", "分布式系统", "高并发"];
  const lowered = text.toLowerCase();
  return skills.filter((skill) => lowered.includes(skill.toLowerCase()) || text.includes(skill)).slice(0, 8);
}

function detectTitle(text = "") {
  if (/架构|architect/i.test(text)) return "后端架构师";
  if (/高级|senior/i.test(text)) return "高级后端工程师";
  if (/java/i.test(text)) return "Java 开发工程师";
  return "后端工程师";
}

function detectCompany(index) {
  return ["美互科技", "同程云", "启元数据", "京东", "创新工场"][index % 5];
}

function detectYears(text = "", index) {
  const match = text.match(/(\d+)\s*年/);
  return match ? `${match[1]} 年` : ["5 年", "3 年", "4 年", "2 年"][index % 4];
}

function detectEducation(text = "") {
  if (/硕士|研究生/.test(text)) return "硕士";
  if (/本科|学士/.test(text)) return "本科";
  if (/大专/.test(text)) return "大专";
  return "未提及";
}

function detectLocation(text = "", index) {
  const match = text.match(/(北京|上海|杭州|深圳|广州|成都|南京|武汉|苏州)/);
  return match?.[1] || ["北京", "上海", "杭州", "深圳"][index % 4];
}

function inferName(fileName = "") {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/简历|高级|后端|工程师|Java|开发|候选人|_|-|\d/gi, "")
    .trim();
  return baseName.slice(0, 4);
}

function recommendationFromScore(score) {
  if (score >= 90) return "强烈推荐";
  if (score >= 80) return "推荐";
  if (score >= 70) return "可面试";
  if (score >= 60) return "待复核";
  return "不推荐";
}

function statusFromScore(score) {
  if (score >= 88) return "强匹配";
  if (score >= 75) return "可面试";
  if (score >= 60) return "待复核";
  return "不推荐";
}

function normalizeBreakdown(breakdown = {}, fallback = 75) {
  return {
    skillMatch: clampScore(breakdown.skillMatch ?? fallback),
    projectDepth: clampScore(breakdown.projectDepth ?? fallback),
    experience: clampScore(breakdown.experience ?? fallback),
    education: clampScore(breakdown.education ?? fallback),
    softSkills: clampScore(breakdown.softSkills ?? fallback),
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 6);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function buildSummaryFromCandidates(candidates = []) {
  const recommended = candidates.filter((candidate) => candidate.score >= 80);
  const average =
    candidates.length > 0
      ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.score, 0) / candidates.length)
      : 0;
  return {
    recommendedCount: recommended.length,
    averageScore: average,
    strongestCandidate: candidates[0]?.name || "",
    mainRisk: "候选人系统设计与稳定性经验需要通过结构化面试验证。",
  };
}
