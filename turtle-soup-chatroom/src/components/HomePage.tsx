import { Bot, FileSearch, Loader2, Play, Search, Shuffle, Sparkles, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { fetchOpeningDirectorPlans } from "../client/openingDirector";
import type { StoredRoomSession } from "../client/roomSessionMemory";
import { collectTags, filterPuzzles } from "../shared/puzzleFilters";
import type { Difficulty, OpeningDirectorDecision, OpeningDirectorPlan, OpeningDirectorTraceItem, PublicPuzzle, PuzzleSort } from "../shared/types";
import { PuzzleCard } from "./PuzzleCard";
import { SelectField } from "./ui";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

const hostPersonas = [
  {
    id: "xiaowai",
    name: "小歪",
    role: "友好主持",
    line: "轻松控场，偶尔吐槽，把离谱脑洞拉回案台。",
    image: "/assets/host-xiaowai.png"
  },
  {
    id: "dav",
    name: "大V",
    role: "冷面侦探",
    line: "灰衣墨镜，专治绕远推理，回答很短，压迫感很足。",
    image: "/assets/host-dav.png"
  },
  {
    id: "guigui",
    name: "龟龟",
    role: "慢速观察员",
    line: "佛系陪推，慢慢点头，适合把节奏放稳。",
    image: "/assets/host-guigui.png"
  }
] as const;

const openingAssistant = {
  name: "小档",
  role: "找题官",
  line: "我只负责理解口味、匹配题目和配置开局，进房后交给主持人接手。",
  image: "/assets/assistant-finder.png"
} as const;

const defaultAgentTrace: OpeningDirectorTraceItem[] = [
  {
    id: "parse_intent",
    toolName: "parse_intent",
    label: "理解偏好",
    status: "active",
    summary: "等待你的开局需求",
    detail: "告诉我想玩的主题、强度、主持风格或时长。",
    inputSummary: "自然语言需求",
    outputSummary: "待解析"
  },
  {
    id: "search_puzzles",
    toolName: "search_puzzles",
    label: "搜索题库",
    status: "waiting",
    summary: "准备检索候选",
    detail: "只会使用已发布题目。",
    inputSummary: "已发布题库",
    outputSummary: "待检索"
  },
  {
    id: "rank_profiles",
    toolName: "rank_profiles",
    label: "匹配画像",
    status: "waiting",
    summary: "准备匹配主题和强度",
    detail: "按画像、难度、热度综合排序。",
    inputSummary: "候选题目",
    outputSummary: "待排序"
  },
  {
    id: "draft_plans",
    toolName: "draft_plans",
    label: "生成方案",
    status: "waiting",
    summary: "准备配置开局",
    detail: "会配好题目、主持人和问数。",
    inputSummary: "排序候选",
    outputSummary: "待生成"
  },
  {
    id: "request_confirm",
    toolName: "request_confirm",
    label: "等待确认",
    status: "waiting",
    summary: "确认后再开房",
    detail: "开房是最后一步，不会自动推进。",
    inputSummary: "开局方案",
    outputSummary: "等待确认"
  }
];

function pickFeaturedPuzzle(puzzles: PublicPuzzle[]): PublicPuzzle | undefined {
  return [...puzzles].sort((left, right) => {
    const playDelta = right.plays - left.plays;
    if (playDelta !== 0) return playDelta;
    return right.rating - left.rating;
  })[0];
}

function formatFeaturedCaseCode(index: number): string {
  if (index < 0) return "CASE-EMPTY";
  return `CASE-${String(index + 1).padStart(3, "0")}`;
}

export function HomePage({
  puzzles: availablePuzzles,
  recentRoom,
  onOpenPuzzle,
  onRandomPuzzle,
  onResumeRoom,
  onStartDirectedPlan
}: {
  puzzles: PublicPuzzle[];
  recentRoom?: StoredRoomSession | null;
  onOpenPuzzle: (puzzle: PublicPuzzle) => void;
  onRandomPuzzle: () => void;
  onResumeRoom?: (session: StoredRoomSession) => void;
  onStartDirectedPlan?: (plan: OpeningDirectorPlan) => void;
}) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [tag, setTag] = useState<string | "all">("all");
  const [sort, setSort] = useState<PuzzleSort>("hot");
  const [directorPrompt, setDirectorPrompt] = useState("涉及父母，反转强一点，不要太血腥");
  const [directorPlans, setDirectorPlans] = useState<OpeningDirectorPlan[]>([]);
  const [agentTrace, setAgentTrace] = useState<OpeningDirectorTraceItem[]>(defaultAgentTrace);
  const [directorDecision, setDirectorDecision] = useState<OpeningDirectorDecision | null>(null);
  const [directorError, setDirectorError] = useState("");
  const [isDirectorLoading, setIsDirectorLoading] = useState(false);
  const [isOpeningAgentOpen, setIsOpeningAgentOpen] = useState(false);

  const tags = useMemo(() => collectTags(availablePuzzles), [availablePuzzles]);
  const featuredPuzzle = useMemo(() => pickFeaturedPuzzle(availablePuzzles), [availablePuzzles]);
  const featuredPuzzleIndex = featuredPuzzle ? availablePuzzles.findIndex((puzzle) => puzzle.id === featuredPuzzle.id) : -1;
  const visiblePuzzles = useMemo(
    () => filterPuzzles(availablePuzzles, { query, difficulty, tag, sort }),
    [availablePuzzles, query, difficulty, tag, sort]
  );

  async function generateOpeningPlans(decisionId?: string) {
    const prompt = directorPrompt.trim();
    if (!prompt) return;
    setIsDirectorLoading(true);
    setDirectorError("");
    setAgentTrace(defaultAgentTrace.map((item, index) => ({
      ...item,
      status: index === 0 ? "active" : "waiting"
    })));
    try {
      const response = await fetchOpeningDirectorPlans({ prompt, limit: 3, decisionId });
      setDirectorDecision(response.decision ?? null);
      setDirectorPlans(response.decision ? [] : response.plans);
      setAgentTrace(response.agentTrace);
    } catch (error) {
      setDirectorError(error instanceof Error ? error.message : "开局导演暂时不可用");
      setDirectorPlans([]);
      setDirectorDecision(null);
    } finally {
      setIsDirectorLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">AI HOSTED TURTLE SOUP</span>
          <h1>知心李歪聊天室</h1>
        </div>
        <div className="top-actions">
          <span className="status-pill">{availablePuzzles.length} 题库</span>
          <button className="primary-button" onClick={onRandomPuzzle}>
            <Shuffle size={16} /> 随机一题
          </button>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="case-hero-panel">
          <div className="case-desk-visual" aria-hidden="true">
            <span className="case-desk-folder case-desk-folder-back" />
            <span className="case-desk-folder case-desk-folder-front" />
            <span className="case-desk-pin case-desk-pin-one" />
            <span className="case-desk-pin case-desk-pin-two" />
            <span className="case-desk-line case-desk-line-one" />
            <span className="case-desk-line case-desk-line-two" />
            <span className="case-desk-scan" />
          </div>
          <div className="case-file-header">
            <span className="panel-kicker"><FileSearch size={14} /> 今日案件桌</span>
            <span className="case-file-code">{formatFeaturedCaseCode(featuredPuzzleIndex)}</span>
          </div>
          <div className="case-file-body">
            <div className="case-file-copy">
              <h2 id="home-hero-title">{featuredPuzzle?.title ?? "等待新案件"}</h2>
              <p>{featuredPuzzle?.surface ?? "题库为空时，这里会显示下一份可推理的案件档案。"}</p>
            </div>
            <div className="case-meta-grid">
              <span>{featuredPuzzle ? difficultyLabel[featuredPuzzle.difficulty] : "待定"}<small>难度</small></span>
              <span>{featuredPuzzle?.rating.toFixed(1) ?? "—"}<small>评分</small></span>
              <span>{featuredPuzzle?.plays ?? 0}<small>游玩</small></span>
            </div>
          </div>
          <div className="case-hero-actions">
            <button
              className="primary-button"
              disabled={!featuredPuzzle}
              onClick={() => featuredPuzzle && onOpenPuzzle(featuredPuzzle)}
            >
              <Play size={16} /> 开始推理
            </button>
            <button className="ghost-button" onClick={onRandomPuzzle}>
              <Shuffle size={16} /> 随机抽案
            </button>
          </div>
          {recentRoom && onResumeRoom && (
            <button className="resume-room-strip" type="button" onClick={() => onResumeRoom(recentRoom)}>
              <span>继续上次房间</span>
              <strong>{recentRoom.puzzleTitle ?? recentRoom.roomId}</strong>
            </button>
          )}
        </div>

        <aside className="host-persona-showcase" aria-label="AI 主持人形象">
          <div className="host-showcase-head">
            <span className="panel-kicker"><Sparkles size={14} /> AI 主持席</span>
            <strong>开局时自动匹配控场风格</strong>
          </div>
          <div className="host-persona-grid">
            {hostPersonas.map((persona) => (
              <article className={`host-persona-card host-persona-card-${persona.id}`} key={persona.id}>
                <div className={`host-persona-avatar host-persona-${persona.id}`} aria-hidden="true">
                  <img src={persona.image} alt="" />
                </div>
                <div>
                  <span>{persona.role}</span>
                  <h3>{persona.name}</h3>
                  <p>{persona.line}</p>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <aside className={isOpeningAgentOpen ? "opening-agent-float opening-agent-float-open" : "opening-agent-float"} aria-label="开局 Agent">
        <button
          className="opening-agent-backdrop"
          type="button"
          aria-label="关闭开局 Agent"
          tabIndex={isOpeningAgentOpen ? 0 : -1}
          onClick={() => setIsOpeningAgentOpen(false)}
        />
        <button
          className="opening-agent-trigger"
          type="button"
          aria-expanded={isOpeningAgentOpen}
          onClick={() => setIsOpeningAgentOpen((value) => !value)}
        >
          <span className="opening-agent-assistant" aria-hidden="true">
            <img src={openingAssistant.image} alt="" />
          </span>
          <span className="opening-agent-trigger-copy">
            <small>开局助理</small>
            <strong>帮我找题</strong>
            <span className="opening-agent-status">
              <span aria-hidden="true" />
              在线找题
            </span>
          </span>
        </button>
        <section className="opening-agent-drawer" aria-hidden={!isOpeningAgentOpen} inert={!isOpeningAgentOpen ? true : undefined}>
          <div className="opening-agent-panel">
            <div className="opening-director-panel" aria-labelledby="opening-director-title">
              <div className="opening-director-head">
                <div>
                  <span className="panel-kicker"><Bot size={14} /> 开局 Agent</span>
                  <h2 id="opening-director-title">说出想玩的感觉，我会先规划，再等你确认开局。</h2>
                </div>
                <button className="icon-button" type="button" aria-label="关闭开局 Agent" onClick={() => setIsOpeningAgentOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="agent-chat-card" aria-label="开局 Agent 对话">
                <div className="agent-chat-avatar" aria-hidden="true">
                  <img src={openingAssistant.image} alt="" />
                </div>
                <div className="agent-chat-bubble">
                  <span>{openingAssistant.name} · {openingAssistant.role}</span>
                  <p>{openingAssistant.line}</p>
                </div>
              </div>
              <form
                className="opening-director-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void generateOpeningPlans();
                }}
              >
                <input
                  value={directorPrompt}
                  onChange={(event) => setDirectorPrompt(event.target.value)}
                  maxLength={300}
                  placeholder="比如：涉及父母，反转强一点，不要太血腥"
                />
                <button className="primary-button" type="submit" disabled={isDirectorLoading}>
                  {isDirectorLoading ? <Loader2 size={16} /> : <Sparkles size={16} />}
                  生成开局方案
                </button>
              </form>
              <div className="opening-director-examples" aria-label="示例偏好">
                {["新手局，别太长", "大V主持，压迫感强一点", "血腥一点，但不要恶心"].map((example) => (
                  <button type="button" key={example} onClick={() => setDirectorPrompt(example)}>{example}</button>
                ))}
              </div>
              <details className="agent-workflow" aria-label="开局 Agent 工作记录">
                <summary>
                  <span>工作记录</span>
                  <small>{isDirectorLoading ? "正在匹配题库" : directorPlans.length > 0 ? "方案已生成，等待确认" : "待命，输入需求后开始"}</small>
                </summary>
                <ol className="agent-trace-list">
                  {agentTrace.map((item) => (
                    <li className={`agent-trace-item agent-trace-${item.status}`} key={item.id}>
                      <span className="agent-trace-dot" aria-hidden="true" />
                      <div>
                        <strong>{item.label}</strong>
                        <code>{item.toolName}</code>
                        <p>{item.summary}</p>
                        <small>{item.detail}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
              {directorError && <p className="opening-director-error">{directorError}</p>}
              {directorDecision && (
                <div className="opening-decision-card">
                  <span>需要你决定</span>
                  <h3>{directorDecision.title}</h3>
                  <p>{directorDecision.reason}</p>
                  <div className="opening-decision-options">
                    {directorDecision.options.map((option) => (
                      <button className="ghost-button" type="button" key={option.id} onClick={() => void generateOpeningPlans(option.id)} disabled={isDirectorLoading}>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {directorPlans.length > 0 && (
                <div className="opening-director-plans">
                  {directorPlans.map((plan) => (
                    <article className="opening-plan-card" key={plan.id}>
                      <span>{plan.title}</span>
                      <h3>{plan.puzzle.title}</h3>
                      <p>{plan.reason}</p>
                      <small className="opening-plan-match">{plan.matchSummary}</small>
                      <div className="opening-plan-chips">
                        {plan.chips.map((chip) => <small key={chip}>{chip}</small>)}
                      </div>
                      <dl>
                        <div><dt>主持</dt><dd>{plan.hostPersonaId === "dav" ? "大V" : plan.hostPersonaId === "guigui" ? "龟龟" : "小歪"}</dd></div>
                        <div><dt>问数</dt><dd>{plan.questionLimit === 0 ? "不限" : `${plan.questionLimit} 问`}</dd></div>
                        <div><dt>强度</dt><dd>{plan.contentIntensity}</dd></div>
                      </dl>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          setIsOpeningAgentOpen(false);
                          onStartDirectedPlan?.(plan);
                        }}
                      >
                        <Play size={16} /> 确认开局
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </aside>

      <section className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索谜题、作者..."
          />
        </label>
        <SelectField
          value={difficulty}
          onChange={setDifficulty}
          ariaLabel="难度筛选"
          options={[
            { value: "all", label: "所有难度" },
            { value: "easy", label: "简单" },
            { value: "medium", label: "中等" },
            { value: "hard", label: "困难" }
          ]}
        />
        <SelectField
          value={tag}
          onChange={setTag}
          ariaLabel="标签筛选"
          options={[
            { value: "all", label: "全部标签" },
            ...tags.map((item) => ({ value: item, label: item }))
          ]}
        />
        <SelectField
          value={sort}
          onChange={setSort}
          ariaLabel="排序方式"
          options={[
            { value: "hot", label: "热门" },
            { value: "latest", label: "最新" },
            { value: "rating", label: "评分最高" }
          ]}
        />
      </section>

      <section className="home-grid">
        <div className="puzzle-list">
          {visiblePuzzles.map((puzzle) => (
            <PuzzleCard puzzle={puzzle} onOpen={onOpenPuzzle} key={puzzle.id} />
          ))}
        </div>
        <aside className="activity-panel">
          {recentRoom && onResumeRoom && (
            <button className="resume-room-card" type="button" onClick={() => onResumeRoom(recentRoom)}>
              <span>继续上次房间</span>
              <strong>{recentRoom.puzzleTitle ?? recentRoom.roomId}</strong>
            </button>
          )}
          <h2><Users size={18} /> 今夜案台</h2>
          <p>先选一碗汤，进房间轮流逼近真相。线索足够时，切到“推理提交”说出完整答案，命中核心真相后解锁汤底和结算。</p>
        </aside>
      </section>
    </main>
  );
}
