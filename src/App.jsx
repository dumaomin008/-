import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";

const defaultJobDescription = `负责后端系统设计与开发，构建高并发、高可用的服务；参与需求评审与技术方案设计；推动代码质量与工程效率提升；保障核心业务系统稳定性。`;

const initialWeights = {
  skillMatch: 40,
  projectDepth: 25,
  experience: 15,
  education: 10,
  softSkills: 10,
};

const weightLabels = {
  skillMatch: "技能匹配",
  projectDepth: "项目经验",
  experience: "工作年限",
  education: "教育背景",
  softSkills: "软性能力",
};

const defaultSkills = ["Java", "Spring Boot", "MySQL", "Redis", "分布式系统", "高并发"];
const bonusSkills = ["Kafka", "Docker", "K8s", "微服务", "Linux"];
const analysisTimeoutMs = 75000;

const starterCandidates = [
  {
    id: "sample-1",
    name: "张磊",
    title: "高级后端工程师",
    company: "美互科技",
    years: "5 年",
    education: "本科",
    location: "北京",
    score: 92,
    recommendation: "强烈推荐",
    status: "强匹配",
    avatar: "/assets/avatar-li-ming.png",
    fileName: "张磊_高级后端工程师.pdf",
    tags: ["Java", "Spring Boot", "Redis", "分布式系统"],
    salary: "32K-45K / 15薪",
    availability: "2 周内到岗",
    breakdown: {
      skillMatch: 95,
      projectDepth: 88,
      experience: 90,
      education: 85,
      softSkills: 88,
    },
    strengths: [
      "5 年 Java 后端经验，主导过高并发电商系统研发",
      "熟悉 Spring Cloud 微服务架构，具备稳定性治理经验",
      "有系统设计能力，能支撑千万级用户交易场景",
    ],
    risks: ["近一年跳槽频率偏高，需要面试确认稳定性预期"],
    evidence: [
      "简历提到 QPS 提升 3 倍，并完成 Redis 缓存治理",
      "主导订单系统拆分，负责服务边界和降级策略",
      "参与性能压测和容量评估，推动稳定性复盘机制",
    ],
    questions: [
      "请详细介绍一次高并发场景下的架构设计与性能优化思路。",
      "如何保证分布式事务的一致性？请结合实践说明。",
      "在项目中你如何定位并解决性能瓶颈？",
    ],
  },
  {
    id: "sample-2",
    name: "李明",
    title: "后端开发工程师",
    company: "同程云",
    years: "3 年",
    education: "本科",
    location: "上海",
    score: 88,
    recommendation: "推荐",
    status: "可面试",
    avatar: "/assets/avatar-sun-jie.png",
    fileName: "李明_后端开发工程师.docx",
    tags: ["Java", "MySQL", "RabbitMQ", "接口设计"],
    salary: "25K-35K / 14薪",
    availability: "15 天",
    breakdown: {
      skillMatch: 90,
      projectDepth: 83,
      experience: 82,
      education: 86,
      softSkills: 85,
    },
    strengths: ["基础扎实，接口设计和数据库优化经验较完整", "具备跨团队沟通经验，交付稳定"],
    risks: ["复杂系统架构经验少于岗位期望，需要确认成长速度"],
    evidence: ["参与会员系统重构，负责接口性能优化", "熟悉消息队列削峰与异步任务设计"],
    questions: ["你如何设计一个可扩展的订单状态流转模型？", "讲一个你处理线上慢查询的完整过程。"],
  },
  {
    id: "sample-3",
    name: "孙洁",
    title: "后端工程师",
    company: "启元数据",
    years: "4 年",
    education: "本科",
    location: "杭州",
    score: 82,
    recommendation: "推荐",
    status: "可面试",
    avatar: "/assets/avatar-zhang-lei.png",
    fileName: "孙洁_后端工程师.pdf",
    tags: ["Java", "Spring Boot", "MySQL", "Docker"],
    salary: "28K-38K / 14薪",
    availability: "1 个月",
    breakdown: {
      skillMatch: 85,
      projectDepth: 80,
      experience: 82,
      education: 84,
      softSkills: 82,
    },
    strengths: ["有平台型项目经验，代码质量意识较好", "能独立负责服务模块设计和交付"],
    risks: ["高并发压测与故障演练经验描述较少"],
    evidence: ["负责数据同步服务和任务调度模块", "推动过单元测试覆盖率提升"],
    questions: ["你如何设计任务调度系统的失败重试机制？", "容器化部署中遇到过哪些稳定性问题？"],
  },
  {
    id: "sample-4",
    name: "吴蕾",
    title: "Java 开发工程师",
    company: "京东",
    years: "3 年",
    education: "本科",
    location: "北京",
    score: 74,
    recommendation: "可面试",
    status: "待复核",
    avatar: "/assets/avatar-wu-lei.png",
    fileName: "吴蕾_Java开发工程师.docx",
    tags: ["Java", "Spring Boot", "MySQL"],
    salary: "22K-30K / 13薪",
    availability: "3 周",
    breakdown: {
      skillMatch: 78,
      projectDepth: 70,
      experience: 72,
      education: 80,
      softSkills: 76,
    },
    strengths: ["岗位核心技术栈基本覆盖，业务理解能力较好"],
    risks: ["大型分布式系统经验不足，项目深度需要面试验证"],
    evidence: ["参与库存服务开发，负责部分接口和报表任务", "有 MySQL 索引优化经验"],
    questions: ["你如何判断一个服务是否需要拆分？", "请说明一次索引优化前后的指标变化。"],
  },
];

function scoreTone(score) {
  if (score >= 88) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "review";
  return "risk";
}

function recommendationTone(recommendation = "") {
  if (recommendation.includes("强")) return "excellent";
  if (recommendation.includes("推荐")) return "good";
  if (recommendation.includes("面试") || recommendation.includes("复核")) return "review";
  return "risk";
}

function formatBytes(size) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function base64ToBlobUrl(base64, mimeType = "application/octet-stream") {
  if (!base64) return "";

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "请求失败，请稍后重试");
  }
  return payload;
}

function normalizeWorkspace(workspace = {}) {
  return {
    jobDescription: workspace.jobDescription || defaultJobDescription,
    weights: Object.keys(workspace.weights || {}).length > 0 ? workspace.weights : initialWeights,
    files: Array.isArray(workspace.files) ? workspace.files : [],
    candidates: Array.isArray(workspace.candidates) && workspace.candidates.length > 0 ? workspace.candidates : starterCandidates,
    selectedId: workspace.selectedId || workspace.candidates?.[0]?.id || starterCandidates[0].id,
  };
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return starterCandidates;

  return candidates.map((candidate, index) => ({
    ...starterCandidates[index % starterCandidates.length],
    ...candidate,
    id: candidate.id || `candidate-${index + 1}`,
    avatar: starterCandidates[index % starterCandidates.length].avatar,
    tags: candidate.tags?.length ? candidate.tags : starterCandidates[index % starterCandidates.length].tags,
    score: Math.max(0, Math.min(100, Number(candidate.score) || 0)),
    breakdown: {
      ...starterCandidates[index % starterCandidates.length].breakdown,
      ...(candidate.breakdown || {}),
    },
    strengths: candidate.strengths?.length ? candidate.strengths : ["AI 已识别到与岗位相关的经验，但需要面试补充验证。"],
    risks: candidate.risks?.length ? candidate.risks : ["简历信息有限，建议面试进一步确认关键项目细节。"],
    evidence: candidate.evidence?.length ? candidate.evidence : ["候选人简历中出现了岗位相关技术关键词。"],
    questions: candidate.questions?.length ? candidate.questions : ["请结合最近项目说明你的职责边界和技术决策。"],
  }));
}

function HealthBadge({ health }) {
  const configured = health?.configured;
  const database = health?.database;
  const databaseLabel = database?.connected
    ? `DB ${database.provider === "supabase" ? "Supabase" : "MySQL"}`
    : "DB 未连接";
  return (
    <span className={`connection-badge ${configured ? "is-live" : "is-demo"}`}>
      <span className="connection-dot" />
      {configured ? `DeepSeek 已连接 · ${health.model} · ${databaseLabel}` : `演示模式 · ${databaseLabel}`}
    </span>
  );
}

function ScoreRing({ score, size = "large" }) {
  const tone = scoreTone(score);
  return (
    <div
      className={`score-ring ${size} tone-${tone}`}
      style={{ "--score": `${score * 3.6}deg` }}
      aria-label={`匹配度 ${score} 分`}
    >
      <span>{score}</span>
      <small>/100</small>
    </div>
  );
}

function AuthScreen({ onSubmit }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await onSubmit({ mode, username, password });
    } catch (submitError) {
      setError(submitError.message || "登录失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <BrainCircuit size={24} />
          </div>
          <div>
            <span className="eyebrow">Resume Screening Studio</span>
            <h1 id="auth-title">{isLogin ? "登录你的筛选工作台" : "创建筛选工作台账号"}</h1>
            <p>上传简历、解析报告和历史记录都会按账号隔离保存。</p>
          </div>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="账号操作">
          <button type="button" className={isLogin ? "active" : ""} onClick={() => setMode("login")}>
            登录
          </button>
          <button type="button" className={!isLogin ? "active" : ""} onClick={() => setMode("register")}>
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>账号</span>
            <input
              value={username}
              autoComplete="username"
              placeholder="例如 hr@example.com"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              value={password}
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="至少 6 个字符"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            {isSubmitting ? "正在处理" : isLogin ? "登录并恢复历史" : "注册并进入工作台"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AppHeader({ health, user, onLogout, onExport, onShare, onPendingAction }) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <BrainCircuit size={22} />
        </div>
        <div>
          <strong>简历智能筛选</strong>
          <span>DeepSeek assessment studio</span>
        </div>
      </div>

      <nav className="main-nav" aria-label="主导航">
        <a href="#workspace" className="active">
          工作台
        </a>
        <a href="#report">报告与分析</a>
        <a href="#talent">人才库</a>
        <a href="#interview">面试管理</a>
      </nav>

      <div className="header-actions">
        <HealthBadge health={health} />
        <span className="account-badge">
          <ShieldCheck size={14} />
          {user?.username}
        </span>
        <button className="icon-button" type="button" aria-label="搜索" onClick={() => onPendingAction("搜索")}>
          <Search size={18} />
        </button>
        <button className="icon-button has-dot" type="button" aria-label="通知" onClick={() => onPendingAction("通知")}>
          <Bell size={18} />
        </button>
        <button className="secondary-button compact" type="button" onClick={onExport}>
          <Download size={16} />
          导出报告
        </button>
        <button className="secondary-button compact" type="button" onClick={onShare}>
          <Share2 size={16} />
          分享报告
        </button>
        <button className="icon-button" type="button" aria-label="设置" onClick={() => onPendingAction("设置")}>
          <Settings size={18} />
        </button>
        <button className="secondary-button compact" type="button" onClick={onLogout}>
          退出
        </button>
      </div>
    </header>
  );
}

function WeightSlider({ name, value, onChange }) {
  return (
    <label className="weight-row">
      <span>{weightLabels[name]}</span>
      <input
        aria-label={`${weightLabels[name]}权重`}
        type="range"
        min="0"
        max="60"
        value={value}
        onChange={(event) => onChange(name, Number(event.target.value))}
      />
      <output>{value}%</output>
    </label>
  );
}

function SetupPanel({
  jobDescription,
  onJobDescriptionChange,
  weights,
  onWeightChange,
  files,
  onFilesSelected,
  onRemoveFile,
  onAnalyze,
  onCancelAnalyze,
  history,
  onRestoreHistory,
  onShowMessage,
  isAnalyzing,
}) {
  const totalWeight = Object.values(weights).reduce((sum, item) => sum + item, 0);

  return (
    <aside className="setup-panel" id="workspace">
      <section className="panel-section">
        <div className="section-heading">
          <div>
            <span className="step-badge">1</span>
            <h2>岗位与需求</h2>
          </div>
          <button className="text-button" type="button" onClick={() => onShowMessage("JD 可直接在下方文本框编辑")}>
            编辑
          </button>
        </div>

        <label className="field-label" htmlFor="job-description">
          JD 概要
        </label>
        <textarea
          id="job-description"
          value={jobDescription}
          maxLength={2000}
          onChange={(event) => onJobDescriptionChange(event.target.value)}
        />
        <div className="field-meta">
          <span>建议包含职责、必备技能、经验年限和加分项</span>
          <span>{jobDescription.length}/2000</span>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <div>
            <SlidersHorizontal size={18} />
            <h3>核心筛选标准</h3>
          </div>
          <span className={totalWeight === 100 ? "weight-total is-ok" : "weight-total"}>
            {totalWeight}%
          </span>
        </div>

        <div className="weights-stack">
          {Object.entries(weights).map(([key, value]) => (
            <WeightSlider key={key} name={key} value={value} onChange={onWeightChange} />
          ))}
        </div>

        <div className="skill-cloud">
          <p>必备技能</p>
          <div>
            {defaultSkills.map((skill) => (
              <span className="skill-chip" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="skill-cloud">
          <p>加分技能</p>
          <div>
            {bonusSkills.map((skill) => (
              <span className="skill-chip muted" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel-section upload-section">
        <div className="section-heading">
          <div>
            <CloudUpload size={18} />
            <h3>批量上传简历</h3>
          </div>
          <span>{files.length} 份</span>
        </div>

        <label className="upload-zone" htmlFor="resume-upload">
          <CloudUpload size={30} />
          <strong>点击或拖拽文件到此处上传</strong>
          <span>支持 PDF、DOCX、TXT、MD，建议单批不超过 50 份</span>
          <input
            id="resume-upload"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(event) => onFilesSelected(event.target.files)}
          />
        </label>

        <div className="file-list" aria-live="polite">
          {files.length === 0 ? (
            <p className="empty-hint">上传简历后会在这里显示文件状态。</p>
          ) : (
            files.map((file) => (
              <div className="file-row" key={file.id}>
                <span className={`file-icon type-${file.ext}`}>
                  <FileText size={15} />
                </span>
                <div>
                  <strong>{file.name}</strong>
                  <span>
                    {formatBytes(file.size)} · {file.status}
                  </span>
                </div>
                <button type="button" aria-label={`移除 ${file.name}`} onClick={() => onRemoveFile(file.id)}>
                  <X size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel-section history-section">
        <div className="section-heading">
          <div>
            <ClipboardList size={18} />
            <h3>历史报告</h3>
          </div>
          <span>{history.length} 条</span>
        </div>
        {history.length === 0 ? (
          <p className="empty-hint">完成解析后，报告会按当前账号保存到这里。</p>
        ) : (
          <div className="history-list">
            {history.slice(0, 5).map((item) => (
              <button className="history-row" type="button" key={item.id} onClick={() => onRestoreHistory(item.id)}>
                <strong>{item.title}</strong>
                <span>
                  {new Date(item.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  均分 {item.averageScore || 0}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="analysis-actions">
        <button className="primary-button run-button" type="button" onClick={onAnalyze} disabled={isAnalyzing}>
          {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          {isAnalyzing ? "正在解析并生成报告" : "开始解析并生成报告"}
        </button>
        {isAnalyzing ? (
          <button className="secondary-button cancel-analysis-button" type="button" onClick={onCancelAnalyze}>
            取消本次分析
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function CandidateSummary({ candidate, onPendingAction, onViewResume }) {
  const tone = recommendationTone(candidate.recommendation);

  return (
    <section className="candidate-hero" id="report">
      <div className="candidate-identity">
        <img src={candidate.avatar} alt={`${candidate.name} 候选人头像`} />
        <div>
          <div className="candidate-title-row">
            <h1>{candidate.name}</h1>
            <span className={`recommend-pill tone-${tone}`}>{candidate.recommendation}</span>
          </div>
          <p>
            {candidate.title} · {candidate.years} · {candidate.education}
          </p>
          <span>
            现任：{candidate.company} · {candidate.location}
          </span>
        </div>
      </div>

      <div className="candidate-actions">
        <button className="secondary-button" type="button" onClick={() => onViewResume(candidate)}>
          <Eye size={16} />
          查看简历
        </button>
        <button className="secondary-button" type="button" onClick={() => onPendingAction("人才库")}>
          <UserPlus size={16} />
          加入人才库
        </button>
        <button className="icon-button" type="button" aria-label="更多操作" onClick={() => onPendingAction("更多操作")}>
          <ChevronDown size={18} />
        </button>
      </div>
    </section>
  );
}

function ScoreBreakdown({ candidate }) {
  return (
    <section className="score-layout">
      <div className="score-overview">
        <ScoreRing score={candidate.score} />
        <div>
          <span className="eyebrow">综合评估</span>
          <h2>{candidate.recommendation}</h2>
          <p>匹配度高于当前批次候选人，建议优先进入面试评估。</p>
        </div>
      </div>

      <div className="radar-panel" aria-label="能力画像">
        <div className="radar-heading">
          <h3>能力画像</h3>
          <div>
            <span />
            候选人
          </div>
        </div>
        <div className="metric-bars">
          {Object.entries(candidate.breakdown).map(([key, value]) => (
            <div className="metric-row" key={key}>
              <span>{weightLabels[key]}</span>
              <div className="metric-track">
                <i style={{ width: `${value}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceList({ title, icon, items, tone = "neutral" }) {
  return (
    <section className={`evidence-section tone-${tone}`}>
      <div className="evidence-heading">
        {icon}
        <h3>{title}</h3>
      </div>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ReportStudio({ candidate, compareMode, onCompareModeChange, onPendingAction, onViewResume }) {
  return (
    <main className="report-studio">
      <div className="studio-toolbar">
        <div className="segmented-control" role="tablist" aria-label="报告视图">
          <button
            type="button"
            className={!compareMode ? "active" : ""}
            onClick={() => onCompareModeChange(false)}
          >
            <ClipboardList size={16} />
            报告视图
          </button>
          <button
            type="button"
            className={compareMode ? "active" : ""}
            onClick={() => onCompareModeChange(true)}
          >
            <LayoutDashboard size={16} />
            对比视图
          </button>
        </div>

        <div className="run-meta">
          <span>由 DeepSeek 模型生成</span>
          <span>更新于刚刚</span>
        </div>
      </div>

      <CandidateSummary candidate={candidate} onPendingAction={onPendingAction} onViewResume={onViewResume} />
      <ScoreBreakdown candidate={candidate} />

      <div className="report-grid">
        <EvidenceList
          title="匹配依据（证据）"
          tone="success"
          icon={<CheckCircle2 size={18} />}
          items={candidate.evidence}
        />
        <EvidenceList
          title="潜在风险"
          tone="warning"
          icon={<AlertTriangle size={18} />}
          items={candidate.risks}
        />
        <EvidenceList
          title="核心优势"
          tone="success"
          icon={<ShieldCheck size={18} />}
          items={candidate.strengths}
        />
        <EvidenceList
          title="面试追问建议"
          tone="info"
          icon={<MessageSquareText size={18} />}
          items={candidate.questions}
        />
      </div>

      <section className="offer-panel">
        <div>
          <span className="eyebrow">薪资与到岗</span>
          <h3>{candidate.salary}</h3>
          <p>期望薪资中位数，最快到岗时间：{candidate.availability}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => onPendingAction("完整分析")}>
          查看完整分析
        </button>
      </section>
    </main>
  );
}

function CandidateList({ candidates, selectedId, onSelectCandidate, onPendingAction }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCandidates = normalizedQuery
    ? candidates.filter((candidate) => {
        const searchable = [
          candidate.name,
          candidate.title,
          candidate.company,
          candidate.status,
          candidate.recommendation,
          ...(candidate.tags || []),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : candidates;

  return (
    <aside className="candidate-panel" id="talent">
      <div className="candidate-panel-header">
        <div>
          <h2>候选人列表</h2>
          <span>{candidates.length} 人 · 综合排序</span>
        </div>
        <button className="icon-button" type="button" aria-label="筛选候选人" onClick={() => onPendingAction("高级筛选")}>
          <Filter size={17} />
        </button>
      </div>

      <label className="search-box">
        <Search size={16} />
        <input
          type="search"
          placeholder="搜索姓名 / 技能 / 公司"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="candidate-filters">
        <button type="button" onClick={() => onPendingAction("排序")}>
          综合排序
          <ChevronDown size={14} />
        </button>
        <button type="button" onClick={() => onPendingAction("状态筛选")}>
          全部状态
          <ChevronDown size={14} />
        </button>
      </div>

      <section className="distribution">
        <h3>匹配度分布</h3>
        <div className="distribution-bars" aria-label="匹配度分布图">
          <span style={{ height: "70%" }} />
          <span style={{ height: "58%" }} />
          <span style={{ height: "42%" }} />
          <span style={{ height: "28%" }} />
          <span style={{ height: "18%" }} />
        </div>
        <div className="distribution-labels">
          <span>90+</span>
          <span>80+</span>
          <span>70+</span>
          <span>60+</span>
          <span>&lt;60</span>
        </div>
      </section>

      <div className="ranking-list">
        {visibleCandidates.length === 0 ? (
          <p className="empty-hint search-empty">没有匹配的候选人</p>
        ) : null}
        {visibleCandidates.map((candidate, index) => {
          const active = candidate.id === selectedId;
          return (
            <button
              className={`ranking-row ${active ? "active" : ""}`}
              type="button"
              key={candidate.id}
              onClick={() => onSelectCandidate(candidate.id)}
            >
              <span className="rank-index">{index + 1}</span>
              <img src={candidate.avatar} alt="" aria-hidden="true" />
              <span className="rank-copy">
                <strong>{candidate.name}</strong>
                <small>
                  {candidate.years} · {candidate.title}
                </small>
              </span>
              <span className={`rank-score tone-${scoreTone(candidate.score)}`}>{candidate.score}</span>
              <span className={`rank-status tone-${recommendationTone(candidate.recommendation)}`}>
                {candidate.recommendation}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CompareBand({ candidates, onSelectCandidate, onPendingAction }) {
  const topCandidates = candidates.slice(0, 3);

  return (
    <section className="compare-band">
      <div className="compare-header">
        <div>
          <span className="eyebrow">对比模式</span>
          <h2>已选择 Top 3 候选人</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => onPendingAction("完整对比分析")}>
          <BarChart3 size={16} />
          查看完整对比分析
        </button>
      </div>

      <div className="compare-grid">
        {topCandidates.map((candidate, index) => (
          <button className="compare-card" type="button" key={candidate.id} onClick={() => onSelectCandidate(candidate.id)}>
            <span className="compare-index">{index + 1}</span>
            <img src={candidate.avatar} alt="" aria-hidden="true" />
            <div>
              <strong>{candidate.name}</strong>
              <span>
                {candidate.score} 分 · {candidate.recommendation}
              </span>
              <div className="mini-bars" aria-hidden="true">
                <i style={{ width: `${candidate.breakdown.skillMatch}%` }} />
                <i style={{ width: `${candidate.breakdown.projectDepth}%` }} />
                <i style={{ width: `${candidate.breakdown.softSkills}%` }} />
              </div>
            </div>
          </button>
        ))}
        <div className="compare-advice">
          <BrainCircuit size={20} />
          <div>
            <strong>对比建议</strong>
            <span>综合经验、项目深度与稳定性，建议优先约面高匹配候选人。</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Toast({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="toast" role="status">
      <CheckCircle2 size={17} />
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function ShareSheet({ text, onClose, onCopy }) {
  if (!text) return null;

  return (
    <section className="share-sheet" aria-label="手动复制分享摘要">
      <div className="share-sheet-header">
        <div>
          <span className="eyebrow">分享摘要</span>
          <h2>浏览器限制自动复制</h2>
        </div>
        <button className="icon-button" type="button" aria-label="关闭分享摘要" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <textarea readOnly value={text} aria-label="候选人分享摘要" />
      <div className="share-sheet-actions">
        <button className="secondary-button" type="button" onClick={onCopy}>
          再试一次复制
        </button>
        <button className="primary-button" type="button" onClick={onClose}>
          我已复制
        </button>
      </div>
    </section>
  );
}

function ResumePreviewDrawer({ candidate, file, onClose, onCopyText }) {
  const closeButtonRef = useRef(null);
  const parsedText = file?.parsedText?.trim() || "";
  const fileUrl = useMemo(() => base64ToBlobUrl(file?.data, file?.type), [file?.data, file?.type]);
  const canPreviewOriginal = fileUrl && file?.ext === "pdf";
  const fileStatus = file?.status || (file ? "已上传" : "样例数据");
  const sourceLabel = file?.name || candidate?.fileName || "未关联原始文件";

  useEffect(() => {
    if (!candidate) return undefined;
    closeButtonRef.current?.focus();
    return undefined;
  }, [candidate]);

  useEffect(() => {
    if (!fileUrl) return undefined;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  if (!candidate) return null;

  return (
    <div className="resume-drawer-shell" role="presentation" onMouseDown={onClose}>
      <section
        className="resume-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="resume-drawer-header">
          <div>
            <span className="eyebrow">简历预览</span>
            <h2 id="resume-preview-title">{candidate.name}</h2>
            <p>
              {candidate.title} · {candidate.years} · {candidate.education}
            </p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label="关闭简历预览" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="resume-summary-strip">
          <div>
            <span>推荐结论</span>
            <strong>{candidate.recommendation}</strong>
          </div>
          <div>
            <span>匹配分</span>
            <strong>{candidate.score}/100</strong>
          </div>
          <div>
            <span>原文件</span>
            <strong>{sourceLabel}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>{fileStatus}</strong>
          </div>
        </div>

        <div className="resume-drawer-actions">
          <button className="secondary-button" type="button" onClick={() => onCopyText(parsedText)} disabled={!parsedText}>
            <Copy size={16} />
            复制解析文本
          </button>
          {fileUrl ? (
            <a className="secondary-button" href={fileUrl} download={file?.name || `${candidate.name}-resume`}>
              <Download size={16} />
              下载原件
            </a>
          ) : (
            <button className="secondary-button" type="button" disabled>
              <Download size={16} />
              暂无原件
            </button>
          )}
        </div>

        <div className="resume-preview-layout">
          <section className="resume-document-panel">
            <div className="resume-panel-heading">
              <FileText size={18} />
              <h3>原始简历</h3>
              {file?.size ? <span>{formatBytes(file.size)}</span> : null}
            </div>

            {canPreviewOriginal ? (
              <iframe className="resume-pdf-frame" title={`${candidate.name} 原始简历`} src={fileUrl} />
            ) : (
              <div className="resume-empty-original">
                <FileText size={26} />
                <strong>{file ? "当前格式以解析文本查看" : "当前为样例候选人"}</strong>
                <span>
                  {file
                    ? "DOCX、TXT、MD 简历会优先展示解析后的文本内容。"
                    : "上传并生成报告后，这里会关联候选人的原始简历文件。"}
                </span>
              </div>
            )}

            <div className="resume-text-panel">
              <div className="resume-panel-heading">
                <ClipboardList size={18} />
                <h3>解析文本</h3>
              </div>
              {parsedText ? (
                <pre>{parsedText}</pre>
              ) : (
                <p>
                  暂无可展示的解析文本。请先上传简历并点击“开始解析并生成报告”，或查看右侧的结构化评估摘要。
                </p>
              )}
            </div>
          </section>

          <aside className="resume-insight-panel">
            <div className="resume-candidate-card">
              <img src={candidate.avatar} alt="" aria-hidden="true" />
              <div>
                <strong>{candidate.name}</strong>
                <span>
                  {candidate.company} · {candidate.location}
                </span>
              </div>
              <ScoreRing score={candidate.score} size="small" />
            </div>

            <EvidenceList
              title="匹配证据"
              tone="success"
              icon={<CheckCircle2 size={18} />}
              items={candidate.evidence}
            />
            <EvidenceList title="潜在风险" tone="warning" icon={<AlertTriangle size={18} />} items={candidate.risks} />
            <EvidenceList
              title="面试追问"
              tone="info"
              icon={<MessageSquareText size={18} />}
              items={candidate.questions}
            />
          </aside>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [jobDescription, setJobDescription] = useState(defaultJobDescription);
  const [weights, setWeights] = useState(initialWeights);
  const [files, setFiles] = useState([]);
  const [candidates, setCandidates] = useState(starterCandidates);
  const [selectedId, setSelectedId] = useState(starterCandidates[0].id);
  const [health, setHealth] = useState({ configured: false, model: "deepseek-v4-flash" });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [toast, setToast] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const [resumePreviewId, setResumePreviewId] = useState("");
  const [auth, setAuth] = useState({ user: null, loading: true });
  const [history, setHistory] = useState([]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const toastTimer = useRef(null);
  const saveTimer = useRef(null);
  const analysisController = useRef(null);
  const analysisTimer = useRef(null);
  const analysisAbortReason = useRef("");
  const workspaceSaveWarningShown = useRef(false);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) || candidates[0],
    [candidates, selectedId],
  );
  const resumePreviewCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === resumePreviewId),
    [candidates, resumePreviewId],
  );
  const resumePreviewFile = useMemo(() => {
    if (!resumePreviewCandidate) return null;
    return (
      files.find(
        (file) => file.id === resumePreviewCandidate.id || file.name === resumePreviewCandidate.fileName,
      ) || null
    );
  }, [files, resumePreviewCandidate]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth({ configured: false, model: "deepseek-v4-flash" }));
  }, []);

  useEffect(() => {
    let isMounted = true;

    apiRequest("/api/session")
      .then((payload) => {
        if (!isMounted) return;
        if (!payload.user) {
          setAuth({ user: null, loading: false });
          return;
        }

        setAuth({ user: payload.user, loading: false });
        applyWorkspace(payload.workspace);
        setHistory(payload.history || []);
        setWorkspaceLoaded(true);
      })
      .catch(() => {
        if (isMounted) {
          setAuth({ user: null, loading: false });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!auth.user || !workspaceLoaded) return undefined;

    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      apiRequest("/api/workspace", {
        method: "PUT",
        body: JSON.stringify({
          jobDescription,
          weights,
          files,
          candidates,
          selectedId,
        }),
      }).catch(() => {
        if (workspaceSaveWarningShown.current) return;
        workspaceSaveWarningShown.current = true;
        showToast("工作台暂时未保存成功，请稍后重试");
      });
    }, 700);

    return () => {
      window.clearTimeout(saveTimer.current);
    };
  }, [auth.user, workspaceLoaded, jobDescription, weights, files, candidates, selectedId]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(analysisTimer.current);
      analysisAbortReason.current = "user";
      analysisController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!resumePreviewCandidate) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setResumePreviewId("");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resumePreviewCandidate]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3600);
  }

  function applyWorkspace(workspace) {
    const normalized = normalizeWorkspace(workspace);
    setJobDescription(normalized.jobDescription);
    setWeights(normalized.weights);
    setFiles(normalized.files);
    setCandidates(normalized.candidates);
    setSelectedId(normalized.selectedId);
    setResumePreviewId("");
  }

  async function handleAuthSubmit({ mode, username, password }) {
    const payload = await apiRequest(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setAuth({ user: payload.user, loading: false });
    applyWorkspace(payload.workspace);
    setHistory(payload.history || []);
    setWorkspaceLoaded(true);
    showToast(mode === "login" ? "已登录，历史工作台已恢复" : "账号已创建，开始筛选简历");
  }

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuth({ user: null, loading: false });
    setWorkspaceLoaded(false);
    setHistory([]);
    setFiles([]);
    setCandidates(starterCandidates);
    setSelectedId(starterCandidates[0].id);
    setJobDescription(defaultJobDescription);
    setWeights(initialWeights);
    setResumePreviewId("");
  }

  async function restoreHistory(runId) {
    const payload = await apiRequest(`/api/history/${runId}/restore`, { method: "POST" });
    applyWorkspace(payload.workspace);
    setHistory(payload.history || []);
    showToast("已恢复历史报告");
  }

  function updateWeight(name, value) {
    setWeights((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function showPendingAction(featureName) {
    showToast(`${featureName}功能正在接入，当前版本先支持筛选报告主流程`);
  }

  async function handleFilesSelected(fileList) {
    if (!fileList?.length) return;
    const nextFiles = await Promise.all(
      Array.from(fileList).map(async (file) => {
        const data = arrayBufferToBase64(await file.arrayBuffer());
        const ext = file.name.split(".").pop()?.toLowerCase() || "file";
        return {
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          name: file.name,
          type: file.type,
          size: file.size,
          ext,
          data,
          status: "已就绪",
          parsedText: "",
        };
      }),
    );
    setFiles((current) => [...current, ...nextFiles]);
  }

  function removeFile(id) {
    setFiles((current) => current.filter((file) => file.id !== id));
  }

  function cancelAnalysis() {
    if (!analysisController.current) return;
    analysisAbortReason.current = "user";
    analysisController.current.abort();
  }

  async function analyzeResumes() {
    if (isAnalyzing) return;

    if (!jobDescription.trim()) {
      showToast("请先填写 JD 概要，再生成适配报告");
      return;
    }

    if (files.length === 0) {
      showToast("请先上传至少 1 份简历，右侧样例报告可直接预览");
      return;
    }

    setIsAnalyzing(true);
    setFiles((current) => current.map((file) => ({ ...file, status: "解析中" })));
    const controller = new AbortController();
    analysisController.current = controller;
    analysisAbortReason.current = "";
    window.clearTimeout(analysisTimer.current);
    analysisTimer.current = window.setTimeout(() => {
      analysisAbortReason.current = "timeout";
      controller.abort();
    }, analysisTimeoutMs);

    try {
      const result = await apiRequest("/api/analyze", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          jobDescription,
          weights,
          files: files.map(({ id, name, type, size, ext, data }) => ({ id, name, type, size, ext, data })),
        }),
      });

      const savedWorkspace = normalizeWorkspace(result.workspace || { candidates: result.candidates });
      const nextCandidates = normalizeCandidates(savedWorkspace.candidates);
      setCandidates(nextCandidates);
      setSelectedId(savedWorkspace.selectedId || nextCandidates[0]?.id);
      setFiles(savedWorkspace.files);
      setHistory(result.history || []);
      const hasDeepSeekFallback = result.extractedFiles?.some((file) => file.status?.includes("DeepSeek"));
      showToast(
        result.source === "deepseek"
          ? "DeepSeek 已生成候选人适配报告"
          : hasDeepSeekFallback
            ? "DeepSeek 未及时返回，已先生成演示报告"
            : "已生成演示报告，可配置 Key 后调用 DeepSeek",
      );
    } catch (error) {
      const isUserCancel = analysisAbortReason.current === "user";
      const isTimeout = analysisAbortReason.current === "timeout" || error.name === "AbortError";
      setFiles((current) =>
        current.map((file) => ({
          ...file,
          status: isUserCancel ? "已取消" : isTimeout ? "分析超时" : "解析失败",
        })),
      );

      if (isUserCancel) {
        showToast("已取消本次分析，原报告保持不变");
      } else {
        showToast(
          isTimeout
            ? `分析超时：超过 ${Math.round(analysisTimeoutMs / 1000)} 秒，请稍后重试或换用更小的文件`
            : error.message || "分析失败，请稍后重试",
        );
      }
    } finally {
      window.clearTimeout(analysisTimer.current);
      if (analysisController.current === controller) {
        analysisController.current = null;
      }
      analysisAbortReason.current = "";
      setIsAnalyzing(false);
    }
  }

  function exportReport() {
    const payload = {
      jobDescription,
      weights,
      generatedAt: new Date().toISOString(),
      candidates,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "candidate-fit-report.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("报告 JSON 已导出");
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back to a textarea copy path for browsers that block async clipboard writes.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-999px";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function shareReport() {
    const summary = `${selectedCandidate.name}：${selectedCandidate.score} 分，${selectedCandidate.recommendation}。核心建议：${selectedCandidate.questions[0]}`;
    const copied = await copyTextToClipboard(summary);

    if (copied) {
      setShareFallback("");
      showToast("候选人摘要已复制，可直接分享给面试官");
      return;
    }

    setShareFallback(summary);
    showToast("浏览器限制自动复制，请在弹窗中手动复制摘要");
  }

  async function copyResumeText(text) {
    if (!text) {
      showToast("当前简历暂无可复制的解析文本");
      return;
    }

    if (await copyTextToClipboard(text)) {
      showToast("简历解析文本已复制");
    } else {
      showToast("浏览器限制自动复制，请手动选中文本复制");
    }
  }

  if (auth.loading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel is-loading">
          <div className="brand-mark" aria-hidden="true">
            <Loader2 className="spin" size={24} />
          </div>
          <h1>正在恢复工作台</h1>
          <p>正在检查登录状态和历史报告。</p>
        </section>
      </main>
    );
  }

  if (!auth.user) {
    return <AuthScreen onSubmit={handleAuthSubmit} />;
  }

  return (
    <div className="app-shell">
      <AppHeader
        health={health}
        user={auth.user}
        onLogout={logout}
        onExport={exportReport}
        onShare={shareReport}
        onPendingAction={showPendingAction}
      />

      <div className="page-grid">
        <SetupPanel
          jobDescription={jobDescription}
          onJobDescriptionChange={setJobDescription}
          weights={weights}
          onWeightChange={updateWeight}
          files={files}
          onFilesSelected={handleFilesSelected}
          onRemoveFile={removeFile}
          onAnalyze={analyzeResumes}
          onCancelAnalyze={cancelAnalysis}
          history={history}
          onRestoreHistory={restoreHistory}
          onShowMessage={showToast}
          isAnalyzing={isAnalyzing}
        />

        <section className="workspace-column">
          <ReportStudio
            candidate={selectedCandidate}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            onPendingAction={showPendingAction}
            onViewResume={(candidate) => setResumePreviewId(candidate.id)}
          />
          <CompareBand candidates={candidates} onSelectCandidate={setSelectedId} onPendingAction={showPendingAction} />
        </section>

        <CandidateList
          candidates={candidates}
          selectedId={selectedId}
          onSelectCandidate={setSelectedId}
          onPendingAction={showPendingAction}
        />
      </div>

      <ShareSheet
        text={shareFallback}
        onClose={() => setShareFallback("")}
        onCopy={async () => {
          if (await copyTextToClipboard(shareFallback)) {
            setShareFallback("");
            showToast("候选人摘要已复制，可直接分享给面试官");
          } else {
            showToast("仍无法自动复制，请手动选中文本复制");
          }
        }}
      />
      <ResumePreviewDrawer
        candidate={resumePreviewCandidate}
        file={resumePreviewFile}
        onClose={() => setResumePreviewId("")}
        onCopyText={copyResumeText}
      />
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
