import { Check, DownloadCloud, RefreshCw, Save, Search, ShieldCheck, X } from "lucide-react";
import type { ChangeEvent, Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPuzzles,
  importAdminPuzzleBatch,
  importAdminPuzzleText,
  publishAdminPuzzleBatch,
  publishAdminPuzzle,
  rejectAdminPuzzle,
  updateAdminPuzzle
} from "../client/adminPuzzles";
import { parsePuzzleFileContent, type ParsedPuzzleFileItem } from "../client/puzzleFileImport";
import type { Difficulty, ManagedPuzzle, PuzzleStatus } from "../shared/types";
import { SelectField } from "./ui";

type AdminStatusFilter = PuzzleStatus | "all";

interface AdminDraft {
  title: string;
  surface: string;
  truth: string;
  solutionPoints: string;
  hints: string;
  difficulty: Difficulty;
  tags: string;
  qualityScore: string;
  qualityIssues: string;
  qualitySummary: string;
  sourceTitle: string;
  sourceUrl: string;
  rawText: string;
}

export function formatBatchImportMessage(input: {
  imported: number;
  failed: Array<{ index: number; message: string }>;
}) {
  if (input.failed.length === 0) return `已导入 ${input.imported} 条`;
  const shownFailures = input.failed
    .slice(0, 5)
    .map((failure) => `第 ${failure.index + 1} 条 ${failure.message}`)
    .join("；");
  const hiddenCount = input.failed.length - 5;
  const suffix = hiddenCount > 0 ? `；另有 ${hiddenCount} 条失败` : "";
  return `已导入 ${input.imported} 条，失败 ${input.failed.length} 条：${shownFailures}${suffix}`;
}

export function AdminPage({
  initialPuzzles = [],
  disableInitialLoad = false
}: {
  initialPuzzles?: ManagedPuzzle[];
  disableInitialLoad?: boolean;
}) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<AdminStatusFilter>("all");
  const [puzzles, setPuzzles] = useState<ManagedPuzzle[]>(initialPuzzles);
  const [selectedId, setSelectedId] = useState(initialPuzzles[0]?.id ?? "");
  const [draft, setDraft] = useState<AdminDraft>(() => puzzleToDraft(initialPuzzles[0]));
  const [rawImport, setRawImport] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileItems, setFileItems] = useState<ParsedPuzzleFileItem[]>([]);
  const [fileImportName, setFileImportName] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedPuzzle = useMemo(
    () => puzzles.find((puzzle) => puzzle.id === selectedId) ?? puzzles[0],
    [puzzles, selectedId]
  );

  useEffect(() => {
    if (selectedPuzzle) {
      setSelectedId(selectedPuzzle.id);
      setDraft(puzzleToDraft(selectedPuzzle));
    }
  }, [selectedPuzzle?.id]);

  useEffect(() => {
    if (!disableInitialLoad) {
      void loadPuzzles();
    }
  }, [status, disableInitialLoad]);

  async function loadPuzzles() {
    setIsBusy(true);
    setMessage("");
    try {
      const nextPuzzles = await fetchAdminPuzzles({
        status: status === "all" ? undefined : status,
        token: token.trim() || undefined
      });
      setPuzzles(nextPuzzles);
      setSelectedIds([]);
      setSelectedId(nextPuzzles[0]?.id ?? "");
      if (nextPuzzles.length === 0) {
        setDraft(puzzleToDraft(undefined));
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function importRawText(event: FormEvent) {
    event.preventDefault();
    const rawText = rawImport.trim();
    if (!rawText) {
      setMessage("请先粘贴题目原文");
      return;
    }
    setIsBusy(true);
    setMessage("正在结构化题目...");
    try {
      const imported = await importAdminPuzzleText(
        {
          rawText,
          sourceTitle: sourceTitle.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined
        },
        { token: token.trim() || undefined }
      );
      setPuzzles((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      setSelectedId(imported.id);
      setRawImport("");
      setMessage("已导入，等待审核");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function chooseImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const items = parsePuzzleFileContent({ filename: file.name, content });
    setFileImportName(file.name);
    setFileItems(items);
    setMessage(items.length > 0 ? `已解析 ${items.length} 条，确认后导入` : "没有解析到可导入题目");
  }

  async function importFileItems() {
    if (fileItems.length === 0) {
      setMessage("请先选择文件");
      return;
    }
    setIsBusy(true);
    setMessage("正在批量导入...");
    try {
      const result = await importAdminPuzzleBatch(fileItems, { token: token.trim() || undefined });
      setPuzzles((current) => [
        ...result.imported,
        ...current.filter((item) => !result.imported.some((imported) => imported.id === item.id))
      ]);
      setSelectedId(result.imported[0]?.id ?? selectedId);
      if (result.failed.length === 0) {
        setFileItems([]);
      }
      setMessage(formatBatchImportMessage({
        imported: result.imported.length,
        failed: result.failed
      }));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSelected(event: FormEvent) {
    event.preventDefault();
    if (!selectedPuzzle) return;
    setIsBusy(true);
    setMessage("");
    try {
      const updated = await updateAdminPuzzle(selectedPuzzle.id, draftToUpdate(draft), {
        token: token.trim() || undefined
      });
      replacePuzzle(updated);
      setMessage("修改已保存");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function publishSelected() {
    if (!selectedPuzzle) return;
    setIsBusy(true);
    setMessage("");
    try {
      const updated = await publishAdminPuzzle(selectedPuzzle.id, { token: token.trim() || undefined });
      replacePuzzle(updated);
      setMessage("题目已发布");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function publishSelectedBatch() {
    const ids = selectedIds.filter((id) => puzzles.some((puzzle) => puzzle.id === id));
    if (ids.length === 0) {
      setMessage("请先选择题目");
      return;
    }
    setIsBusy(true);
    setMessage("正在批量发布...");
    try {
      const result = await publishAdminPuzzleBatch(ids, { token: token.trim() || undefined });
      setPuzzles((current) => current.map((puzzle) => result.published.find((item) => item.id === puzzle.id) ?? puzzle));
      setSelectedIds((current) => current.filter((id) => result.failed.some((failure) => failure.id === id)));
      const failureText = result.failed.length
        ? `，失败 ${result.failed.length} 条：${result.failed.map((failure) => failure.message).join("；")}`
        : "";
      setMessage(`已发布 ${result.published.length} 条${failureText}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function rejectSelected() {
    if (!selectedPuzzle) return;
    setIsBusy(true);
    setMessage("");
    try {
      const updated = await rejectAdminPuzzle(selectedPuzzle.id, { token: token.trim() || undefined });
      replacePuzzle(updated);
      setMessage("题目已驳回");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function replacePuzzle(updated: ManagedPuzzle) {
    setPuzzles((current) => current.map((puzzle) => (puzzle.id === updated.id ? updated : puzzle)));
    setSelectedId(updated.id);
    setDraft(puzzleToDraft(updated));
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="eyebrow">PUZZLE OPS</span>
          <h1>题库审核台</h1>
        </div>
        <div className="admin-top-actions">
          <label className="admin-token">
            <ShieldCheck size={16} />
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ADMIN_TOKEN"
              type="password"
            />
          </label>
          <SelectField
            value={status}
            onChange={setStatus}
            ariaLabel="审核状态"
            options={[
              { value: "all", label: "全部状态" },
              { value: "draft", label: "草稿" },
              { value: "reviewing", label: "待审核" },
              { value: "published", label: "已发布" },
              { value: "rejected", label: "已驳回" }
            ]}
          />
          <button className="ghost-button" type="button" onClick={loadPuzzles} disabled={isBusy}>
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
      </header>

      {message && <div className="admin-message">{message}</div>}

      <section className="admin-import-panel">
        <div>
          <h2>粘贴原文导入</h2>
          <p>把搜集来的题目原文放进审核队列，结构化后再人工发布。</p>
        </div>
        <form className="admin-import-form" onSubmit={importRawText}>
          <textarea
            value={rawImport}
            onChange={(event) => setRawImport(event.target.value)}
            placeholder="粘贴海龟汤原文、汤面、汤底或网页摘录..."
          />
          <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="来源标题" />
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="来源 URL" />
          <button className="primary-button" type="submit" disabled={isBusy}>
            <DownloadCloud size={16} /> 导入
          </button>
        </form>
      </section>

      <section className="admin-import-panel admin-file-import-panel">
        <div>
          <h2>文件导入</h2>
          <p>支持 .txt/.md/.csv，解析后进入审核队列。</p>
        </div>
        <div className="admin-file-import-form">
          <label className="ghost-button">
            <DownloadCloud size={16} /> 选择文件
            <input type="file" accept=".txt,.md,.markdown,.csv" onChange={chooseImportFile} hidden />
          </label>
          <span>{fileImportName || "未选择文件"}</span>
          <strong>{fileItems.length > 0 ? `${fileItems.length} 条待导入` : "支持 .txt/.md/.csv"}</strong>
          <button className="primary-button" type="button" onClick={importFileItems} disabled={isBusy || fileItems.length === 0}>
            导入文件题目
          </button>
        </div>
      </section>

      <section className="admin-workbench">
        <aside className="admin-list-panel">
          <div className="admin-list-head">
            <h2>审核队列</h2>
            <span>{puzzles.length} 条</span>
          </div>
          <div className="admin-bulk-actions">
            <span>已选择 {selectedIds.length} 条</span>
            <button className="primary-button" type="button" onClick={publishSelectedBatch} disabled={isBusy || selectedIds.length === 0}>
              <Check size={16} /> 批量发布
            </button>
          </div>
          <label className="admin-search">
            <Search size={16} />
            <span>按左侧状态筛选，选择题目后在右侧编辑。</span>
          </label>
          <div className="admin-puzzle-list">
            {puzzles.map((puzzle) => (
              <div
                className={`admin-puzzle-row ${puzzle.id === selectedPuzzle?.id ? "admin-puzzle-row-active" : ""}`}
                key={puzzle.id}
              >
                <label className="admin-row-check" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(puzzle.id)}
                    onChange={(event) => toggleSelected(puzzle.id, event.target.checked)}
                  />
                  选择题目
                </label>
                <button
                  className="admin-puzzle-main"
                  type="button"
                  onClick={() => {
                    setSelectedId(puzzle.id);
                    setDraft(puzzleToDraft(puzzle));
                  }}
                >
                  <span className={`admin-status admin-status-${puzzle.status}`}>{statusLabel(puzzle.status)}</span>
                  <strong>{puzzle.title}</strong>
                  <small>{difficultyLabel(puzzle.difficulty)} · {puzzle.qualityScore} 分 · {puzzle.sourceTitle || "无来源"}</small>
                </button>
              </div>
            ))}
            {puzzles.length === 0 && <p className="admin-empty">暂无题目，先导入一条原文。</p>}
          </div>
        </aside>

        <form className="admin-editor-panel" onSubmit={saveSelected}>
          <div className="admin-editor-head">
            <div>
              <h2>{selectedPuzzle ? selectedPuzzle.title : "未选择题目"}</h2>
              {selectedPuzzle && <span className={`admin-status admin-status-${selectedPuzzle.status}`}>{statusLabel(selectedPuzzle.status)}</span>}
            </div>
            <div className="admin-editor-actions">
              <button className="ghost-button" type="submit" disabled={!selectedPuzzle || isBusy}>
                <Save size={16} /> 保存修改
              </button>
              <button className="primary-button" type="button" onClick={publishSelected} disabled={!selectedPuzzle || isBusy}>
                <Check size={16} /> 发布
              </button>
              <button className="ghost-button" type="button" onClick={rejectSelected} disabled={!selectedPuzzle || isBusy}>
                <X size={16} /> 驳回
              </button>
            </div>
          </div>

          <div className="admin-editor-grid">
            <AdminField label="标题">
              <input value={draft.title} onChange={(event) => setDraftField(setDraft, "title", event.target.value)} />
            </AdminField>
            <AdminField label="难度">
              <SelectField
                value={draft.difficulty}
                onChange={(value) => setDraftField(setDraft, "difficulty", value)}
                ariaLabel="题目难度"
                options={[
                  { value: "easy", label: "简单" },
                  { value: "medium", label: "中等" },
                  { value: "hard", label: "困难" }
                ]}
              />
            </AdminField>
            <AdminField label="质量评分">
              <input value={draft.qualityScore} onChange={(event) => setDraftField(setDraft, "qualityScore", event.target.value)} type="number" min="0" max="100" />
            </AdminField>
            <AdminField label="标签">
              <input value={draft.tags} onChange={(event) => setDraftField(setDraft, "tags", event.target.value)} placeholder="悬疑, 本格" />
            </AdminField>
          </div>

          <AdminField label="汤面">
            <textarea value={draft.surface} onChange={(event) => setDraftField(setDraft, "surface", event.target.value)} />
          </AdminField>
          <AdminField label="汤底">
            <textarea value={draft.truth} onChange={(event) => setDraftField(setDraft, "truth", event.target.value)} />
          </AdminField>
          <AdminField label="关键点（每行一个）">
            <textarea value={draft.solutionPoints} onChange={(event) => setDraftField(setDraft, "solutionPoints", event.target.value)} />
          </AdminField>
          <AdminField label="提示（每行一个）">
            <textarea value={draft.hints} onChange={(event) => setDraftField(setDraft, "hints", event.target.value)} />
          </AdminField>
          <AdminField label="质量问题（每行一个）">
            <textarea value={draft.qualityIssues} onChange={(event) => setDraftField(setDraft, "qualityIssues", event.target.value)} />
          </AdminField>
          <AdminField label="质量摘要">
            <input value={draft.qualitySummary} onChange={(event) => setDraftField(setDraft, "qualitySummary", event.target.value)} />
          </AdminField>
          <div className="admin-editor-grid">
            <AdminField label="来源标题">
              <input value={draft.sourceTitle} onChange={(event) => setDraftField(setDraft, "sourceTitle", event.target.value)} />
            </AdminField>
            <AdminField label="来源 URL">
              <input value={draft.sourceUrl} onChange={(event) => setDraftField(setDraft, "sourceUrl", event.target.value)} />
            </AdminField>
          </div>
          <AdminField label="原始文本">
            <textarea value={draft.rawText} onChange={(event) => setDraftField(setDraft, "rawText", event.target.value)} />
          </AdminField>
        </form>
      </section>
    </main>
  );
}

function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function puzzleToDraft(puzzle?: ManagedPuzzle): AdminDraft {
  return {
    title: puzzle?.title ?? "",
    surface: puzzle?.surface ?? "",
    truth: puzzle?.truth ?? "",
    solutionPoints: puzzle?.solutionPoints.join("\n") ?? "",
    hints: puzzle?.hints.join("\n") ?? "",
    difficulty: puzzle?.difficulty ?? "medium",
    tags: puzzle?.tags.join(", ") ?? "",
    qualityScore: String(puzzle?.qualityScore ?? 0),
    qualityIssues: puzzle?.qualityIssues.join("\n") ?? "",
    qualitySummary: puzzle?.qualitySummary ?? "",
    sourceTitle: puzzle?.sourceTitle ?? "",
    sourceUrl: puzzle?.sourceUrl ?? "",
    rawText: puzzle?.rawText ?? ""
  };
}

function draftToUpdate(draft: AdminDraft) {
  return {
    title: draft.title.trim(),
    surface: draft.surface.trim(),
    truth: draft.truth.trim(),
    solutionPoints: splitLines(draft.solutionPoints),
    hints: splitLines(draft.hints),
    difficulty: draft.difficulty,
    tags: splitTags(draft.tags),
    qualityScore: Math.max(0, Math.min(100, Number(draft.qualityScore) || 0)),
    qualityIssues: splitLines(draft.qualityIssues),
    qualitySummary: draft.qualitySummary.trim(),
    sourceTitle: draft.sourceTitle.trim() || undefined,
    sourceUrl: draft.sourceUrl.trim() || undefined,
    rawText: draft.rawText.trim() || undefined
  };
}

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function splitTags(value: string) {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function setDraftField<T extends keyof AdminDraft>(
  setDraft: Dispatch<SetStateAction<AdminDraft>>,
  key: T,
  value: AdminDraft[T]
) {
  setDraft((current) => ({ ...current, [key]: value }));
}

function statusLabel(status: PuzzleStatus) {
  return {
    draft: "草稿",
    reviewing: "待审核",
    published: "已发布",
    rejected: "已驳回"
  }[status];
}

function difficultyLabel(difficulty: Difficulty) {
  return {
    easy: "简单",
    medium: "中等",
    hard: "困难"
  }[difficulty];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
