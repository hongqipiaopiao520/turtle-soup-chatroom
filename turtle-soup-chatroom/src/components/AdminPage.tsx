import { Bot, Check, DownloadCloud, RefreshCw, Save, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import type { ChangeEvent, ClipboardEvent, Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  type AdminBatchImportFailure,
  type AdminImageImportResult,
  deleteAdminPuzzleBatch,
  fetchAdminPuzzles,
  generateAdminPuzzleAiProfiles,
  importAdminPuzzleBatch,
  importAdminPuzzleText,
  parseAdminPuzzleImages,
  publishAdminPuzzleBatch,
  publishAdminPuzzle,
  reanalyzeAdminPuzzleTags,
  rejectAdminPuzzle,
  updateAdminPuzzle
} from "../client/adminPuzzles";
import { parsePuzzleFileContent, type ParsedPuzzleFileItem } from "../client/puzzleFileImport";
import { createPuzzleAgentAudit } from "../shared/puzzleAgentAudit";
import type { Difficulty, ManagedPuzzle, PuzzleAiProfile, PuzzleStatus } from "../shared/types";
import { AiHostHarnessPanel } from "./AiHostHarnessPanel";
import { SelectField } from "./ui";

type AdminStatusFilter = PuzzleStatus | "all";
type AdminTab = "import" | "puzzles" | "ai-host";

const MAX_IMAGE_TOTAL_BYTES = 12 * 1024 * 1024;

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
  failed: Array<{ index: number; message: string; rawText?: string }>;
}) {
  if (input.failed.length === 0) return `已导入 ${input.imported} 条`;
  const shownFailures = input.failed
    .slice(0, 5)
    .map((failure) => `第 ${failure.index + 1} 条 ${failure.message}`)
    .join("；");
  const hiddenCount = input.failed.length - 5;
  const suffix = hiddenCount > 0 ? `；另有 ${hiddenCount} 条失败` : "";
  return `已导入 ${input.imported} 条，失败 ${input.failed.length} 条：${shownFailures}${suffix}。失败项已保留，可重试或下载清单。`;
}

export function AdminPage({
  initialPuzzles = [],
  disableInitialLoad = false,
  initialTab = "puzzles"
}: {
  initialPuzzles?: ManagedPuzzle[];
  disableInitialLoad?: boolean;
  initialTab?: AdminTab;
}) {
  const [token, setToken] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [status, setStatus] = useState<AdminStatusFilter>("all");
  const [puzzles, setPuzzles] = useState<ManagedPuzzle[]>(initialPuzzles);
  const [selectedId, setSelectedId] = useState(initialPuzzles[0]?.id ?? "");
  const [draft, setDraft] = useState<AdminDraft>(() => puzzleToDraft(initialPuzzles[0]));
  const [rawImport, setRawImport] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileItems, setFileItems] = useState<ParsedPuzzleFileItem[]>([]);
  const [failedFileItems, setFailedFileItems] = useState<AdminBatchImportFailure[]>([]);
  const [fileImportName, setFileImportName] = useState("");
  const [imageItems, setImageItems] = useState<Array<{ file: File; role: "auto" | "surface" | "truth" | "full" }>>([]);
  const [imageImportResult, setImageImportResult] = useState<AdminImageImportResult | null>(null);
  const [imageRawText, setImageRawText] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminDifficulty, setAdminDifficulty] = useState<Difficulty | "all">("all");
  const [adminTag, setAdminTag] = useState("all");

  const selectedPuzzle = useMemo(
    () => puzzles.find((puzzle) => puzzle.id === selectedId) ?? puzzles[0],
    [puzzles, selectedId]
  );
  const availableTags = useMemo(
    () => Array.from(new Set(puzzles.flatMap((puzzle) => puzzle.tags))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    [puzzles]
  );
  const filteredPuzzles = useMemo(() => {
    const query = adminQuery.trim().toLowerCase();
    return puzzles.filter((puzzle) => {
      const matchesQuery = !query || [
        puzzle.title,
        puzzle.surface,
        puzzle.truth,
        puzzle.sourceTitle ?? "",
        puzzle.sourceUrl ?? "",
        puzzle.tags.join(" ")
      ].some((value) => value.toLowerCase().includes(query));
      const matchesDifficulty = adminDifficulty === "all" || puzzle.difficulty === adminDifficulty;
      const matchesTag = adminTag === "all" || puzzle.tags.includes(adminTag);
      return matchesQuery && matchesDifficulty && matchesTag;
    });
  }, [adminDifficulty, adminQuery, adminTag, puzzles]);

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
      setActiveTab("puzzles");
      setRawImport("");
      setMessage("已导入并发布");
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
    setFailedFileItems([]);
    setMessage(items.length > 0 ? `已解析 ${items.length} 条，确认后导入` : "没有解析到可导入题目");
  }

  async function chooseImageFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (files.length === 0) return;
    const items = await imageFilesToItems(files);
    setImageItems(items);
    setImageImportResult(null);
    setImageRawText("");
    setMessage(`已选择 ${items.length} 张图片，共 ${formatBytes(getImageItemsBytes(items))}`);
  }

  async function pasteImageFiles(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
      .slice(0, 6);
    if (files.length === 0) {
      setMessage("剪贴板里没有图片，请复制网页图片后再粘贴");
      return;
    }
    event.preventDefault();
    const items = await imageFilesToItems(files, imageItems.length);
    const nextItems = [...imageItems, ...items].slice(0, 6);
    setImageItems(nextItems);
    setImageImportResult(null);
    setImageRawText("");
    setMessage(`已粘贴 ${items.length} 张图片，共 ${nextItems.length} 张，合计 ${formatBytes(getImageItemsBytes(nextItems))}`);
  }

  async function imageFilesToItems(files: File[], offset = 0) {
    return Promise.all(files.map(async (file, index) => ({
      file,
      role: offset + index === 0 ? "surface" as const : offset + index === 1 ? "truth" as const : "auto" as const
    })));
  }

  async function parseImageItems() {
    if (imageItems.length === 0) {
      setMessage("请先选择图片");
      return;
    }
    setIsBusy(true);
    setMessage("正在解析图片...");
    try {
      const totalBytes = getImageItemsBytes(imageItems);
      if (totalBytes > MAX_IMAGE_TOTAL_BYTES) {
        setMessage(`图片合计 ${formatBytes(totalBytes)}，超过 ${formatBytes(MAX_IMAGE_TOTAL_BYTES)}，请减少图片数量或裁剪长图后再试`);
        return;
      }
      const result = await parseAdminPuzzleImages({
        images: imageItems.map(({ file, role }) => ({ file, role }))
      }, { token: token.trim() || undefined });
      setImageImportResult(result);
      setImageRawText(result.rawText);
      setMessage(result.correctedNotes.length > 0 ? `图片已解析：${result.correctedNotes.join("；")}` : "图片已解析，请确认文本后导入");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function importImageRawText() {
    const rawText = imageRawText.trim();
    if (!rawText) {
      setMessage("请先解析图片");
      return;
    }
    setIsBusy(true);
    setMessage("正在导入图片题目...");
    try {
      const imported = await importAdminPuzzleText(
          {
            rawText,
          sourceTitle: imageItems.length > 0 ? `图片导入：${imageItems.map((item) => item.file.name).join(", ")}` : "图片导入"
        },
        { token: token.trim() || undefined }
      );
      setPuzzles((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      setSelectedId(imported.id);
      setActiveTab("puzzles");
      setImageItems([]);
      setImageImportResult(null);
      setImageRawText("");
      setMessage("图片题目已导入并发布");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function importFileItems(items = fileItems) {
    if (items.length === 0) {
      setMessage("请先选择文件");
      return;
    }
    setIsBusy(true);
    setMessage("正在批量导入...");
    try {
      const result = await importAdminPuzzleBatch(items, { token: token.trim() || undefined });
      setPuzzles((current) => [
        ...result.imported,
        ...current.filter((item) => !result.imported.some((imported) => imported.id === item.id))
      ]);
      setSelectedId(result.imported[0]?.id ?? selectedId);
      if (result.imported.length > 0) {
        setActiveTab("puzzles");
      }
      if (result.failed.length === 0) {
        setFileItems([]);
      }
      setFailedFileItems(result.failed);
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

  function retryFailedFileItems() {
    void importFileItems(failedFileItems.map(({ rawText, sourceTitle, sourceUrl }) => ({ rawText, sourceTitle, sourceUrl })));
  }

  function downloadFailedFileItems() {
    if (failedFileItems.length === 0) return;
    const content = JSON.stringify(failedFileItems, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileImportName || "puzzle-import"}-failed.json`;
    link.click();
    URL.revokeObjectURL(url);
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

  async function reanalyzeSelectedTags() {
    const ids = selectedIds.length > 0 ? selectedIds : selectedPuzzle ? [selectedPuzzle.id] : [];
    if (ids.length === 0) {
      setMessage("请先选择要重新分析标签的题目");
      return;
    }
    setIsBusy(true);
    setMessage("正在重新分析标签...");
    try {
      const result = await reanalyzeAdminPuzzleTags({ ids }, { token: token.trim() || undefined });
      setPuzzles((current) => current.map((puzzle) => result.updated.find((item) => item.id === puzzle.id) ?? puzzle));
      const updatedSelected = result.updated.find((item) => item.id === selectedId);
      if (updatedSelected) {
        setDraft(puzzleToDraft(updatedSelected));
      }
      setMessage(`已更新 ${result.updated.length} 条标签，${result.unchanged.length} 条无需修改`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function generateSelectedAiProfiles(overwrite = false, explicitIds?: string[]) {
    const ids = explicitIds ?? (selectedIds.length > 0 ? selectedIds : selectedPuzzle ? [selectedPuzzle.id] : []);
    if (ids.length === 0) {
      setMessage("请先选择要生成 AI 画像的题目");
      return;
    }
    setIsBusy(true);
    setMessage("正在生成 AI 画像...");
    try {
      const result = await generateAdminPuzzleAiProfiles({ ids, overwrite }, { token: token.trim() || undefined });
      setPuzzles((current) => current.map((puzzle) => result.updated.find((item) => item.id === puzzle.id) ?? puzzle));
      const updatedSelected = result.updated.find((item) => item.id === selectedId);
      if (updatedSelected) {
        setDraft(puzzleToDraft(updatedSelected));
      }
      const failureText = result.failed.length
        ? `，失败 ${result.failed.length} 条：${result.failed.map((failure) => failure.message).join("；")}`
        : "";
      setMessage(`已生成 ${result.updated.length} 条 AI 画像，跳过 ${result.skipped.length} 条${failureText}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteSelectedImports() {
    const ids = selectedIds.length > 0
      ? selectedIds.filter((id) => puzzles.some((puzzle) => puzzle.id === id))
      : selectedPuzzle ? [selectedPuzzle.id] : [];
    if (ids.length === 0) {
      setMessage("请先选择要删除的导入题目");
      return;
    }
    const confirmed = window.confirm(`确定删除 ${ids.length} 条导入题目吗？此操作不会进入已驳回列表。`);
    if (!confirmed) return;
    setIsBusy(true);
    setMessage("正在删除导入题目...");
    try {
      const result = await deleteAdminPuzzleBatch(ids, { token: token.trim() || undefined });
      const deletedIds = new Set(result.deleted.map((puzzle) => puzzle.id));
      const nextPuzzles = puzzles.filter((puzzle) => !deletedIds.has(puzzle.id));
      setPuzzles(nextPuzzles);
      setSelectedIds((current) => current.filter((id) => result.failed.some((failure) => failure.id === id)));
      if (!selectedPuzzle || deletedIds.has(selectedPuzzle.id) || !nextPuzzles.some((puzzle) => puzzle.id === selectedPuzzle.id)) {
        const nextSelected = nextPuzzles[0];
        setSelectedId(nextSelected?.id ?? "");
        setDraft(puzzleToDraft(nextSelected));
      }
      const failureText = result.failed.length
        ? `，失败 ${result.failed.length} 条：${result.failed.map((failure) => failure.message).join("；")}`
        : "";
      setMessage(`已删除 ${result.deleted.length} 条导入题目${failureText}`);
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

  function selectAllVisible() {
    setSelectedIds(filteredPuzzles.map((puzzle) => puzzle.id));
  }

  function clearSelected() {
    setSelectedIds([]);
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
        </div>
      </header>

      <nav className="admin-tabs" aria-label="管理台模块">
        {[
          { id: "import" as const, label: "导入题目" },
          { id: "puzzles" as const, label: "题库审核" },
          { id: "ai-host" as const, label: "AI 主持质检" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`admin-tab-button ${activeTab === tab.id ? "admin-tab-button-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message && <div className="admin-message">{message}</div>}

      {activeTab === "import" && <div className="admin-tab-panel">
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
          <button className="primary-button" type="button" onClick={() => void importFileItems()} disabled={isBusy || fileItems.length === 0}>
            导入文件题目
          </button>
          {failedFileItems.length > 0 && (
            <>
              <strong>{failedFileItems.length} 条失败项已保留</strong>
              <button className="ghost-button" type="button" onClick={retryFailedFileItems} disabled={isBusy}>
                <RefreshCw size={16} /> 重试失败项
              </button>
              <button className="ghost-button" type="button" onClick={downloadFailedFileItems} disabled={isBusy}>
                <DownloadCloud size={16} /> 下载失败清单
              </button>
            </>
          )}
        </div>
      </section>

      <section className="admin-import-panel admin-image-import-panel">
        <div>
          <h2>图片导入</h2>
          <p>上传汤面、汤底截图，AI 会保留原换行并修正明显错别字。</p>
        </div>
        <div className="admin-image-import-form">
          <div
            className="admin-image-paste-zone"
            tabIndex={0}
            role="button"
            onPaste={pasteImageFiles}
          >
            <strong>点击这里后直接粘贴网页图片</strong>
            <span>支持从网页、微信、截图工具复制图片后粘贴，最多 6 张。</span>
          </div>
          <label className="ghost-button">
            <DownloadCloud size={16} /> 选择图片
            <input type="file" accept="image/*" multiple onChange={chooseImageFiles} hidden />
          </label>
          <span>{imageItems.length > 0 ? `${imageItems.length} 张图片` : "支持多张截图"}</span>
          <button className="ghost-button" type="button" onClick={parseImageItems} disabled={isBusy || imageItems.length === 0}>
            <RefreshCw size={16} /> 解析图片
          </button>
          <button className="primary-button" type="button" onClick={() => void importImageRawText()} disabled={isBusy || !imageRawText.trim()}>
            导入并发布
          </button>
          {imageImportResult && (
            <textarea
              className="admin-image-preview"
              value={imageRawText}
              onChange={(event) => setImageRawText(event.target.value)}
              placeholder="图片解析结果会显示在这里，原换行会保留..."
            />
          )}
        </div>
      </section>
      </div>}

      {activeTab === "ai-host" && <div className="admin-tab-panel">
        <AiHostHarnessPanel token={token} disabled={isBusy} />
      </div>}

      {activeTab === "puzzles" && <div className="admin-tab-panel">
      <section className="admin-workbench">
        <aside className="admin-list-panel">
          <div className="admin-list-head">
            <h2>审核队列</h2>
            <div className="admin-list-head-actions">
              <span>{filteredPuzzles.length}/{puzzles.length} 条</span>
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
          </div>
          <div className="admin-bulk-actions">
            <span>已选择 {selectedIds.length} 条</span>
            <button className="ghost-button" type="button" onClick={selectAllVisible} disabled={isBusy || filteredPuzzles.length === 0}>
              全选当前列表
            </button>
            <button className="ghost-button" type="button" onClick={clearSelected} disabled={isBusy || selectedIds.length === 0}>
              清空选择
            </button>
            <button className="primary-button" type="button" onClick={publishSelectedBatch} disabled={isBusy || selectedIds.length === 0}>
              <Check size={16} /> 批量发布
            </button>
            <button className="ghost-button" type="button" onClick={reanalyzeSelectedTags} disabled={isBusy || (!selectedPuzzle && selectedIds.length === 0)}>
              <RefreshCw size={16} /> 重新分析标签
            </button>
            <button className="ghost-button" type="button" onClick={() => void generateSelectedAiProfiles(false)} disabled={isBusy || (!selectedPuzzle && selectedIds.length === 0)}>
              <Sparkles size={16} /> 生成 AI 画像
            </button>
            <button className="ghost-button danger-button" type="button" onClick={deleteSelectedImports} disabled={isBusy || (!selectedPuzzle && selectedIds.length === 0)}>
              <Trash2 size={16} /> 删除导入
            </button>
          </div>
          <div className="admin-list-filters" aria-label="题库列表筛选">
            <label className="admin-search">
              <Search size={16} />
              <input
                value={adminQuery}
                onChange={(event) => setAdminQuery(event.target.value)}
                placeholder="筛选标题、汤面、来源、标签..."
              />
            </label>
            <SelectField
              value={adminDifficulty}
              onChange={(value) => setAdminDifficulty(value as Difficulty | "all")}
              ariaLabel="筛选难度"
              options={[
                { value: "all", label: "全部难度" },
                { value: "easy", label: "简单" },
                { value: "medium", label: "中等" },
                { value: "hard", label: "困难" }
              ]}
            />
            <SelectField
              value={adminTag}
              onChange={setAdminTag}
              ariaLabel="筛选标签"
              options={[
                { value: "all", label: "全部标签" },
                ...availableTags.map((tag) => ({ value: tag, label: tag }))
              ]}
            />
          </div>
          <div className="admin-puzzle-list">
            {filteredPuzzles.map((puzzle) => (
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
            {puzzles.length > 0 && filteredPuzzles.length === 0 && <p className="admin-empty">没有符合筛选条件的题目。</p>}
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
          <AiProfilePanel
            puzzle={selectedPuzzle}
            profile={selectedPuzzle?.aiProfile}
            disabled={!selectedPuzzle || isBusy}
            onGenerate={() => selectedPuzzle && void generateSelectedAiProfiles(true, [selectedPuzzle.id])}
          />
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
      </div>}
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

function AiProfilePanel({
  puzzle,
  profile,
  disabled,
  onGenerate
}: {
  puzzle?: ManagedPuzzle;
  profile?: PuzzleAiProfile;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const audit = createPuzzleAgentAudit(puzzle);

  return (
    <section className="admin-ai-profile-panel" aria-label="题库 Agent 审核台">
      <div className="admin-ai-profile-head">
        <div>
          <span><Bot size={14} /> 题库 Agent 审核台</span>
          <strong>{profile ? "开局导演可用" : "暂无 AI 画像"}</strong>
        </div>
        <button className="ghost-button" type="button" onClick={onGenerate} disabled={disabled}>
          <Sparkles size={16} /> 为当前题生成
        </button>
      </div>
      <dl className="admin-agent-audit-grid">
        <div><dt>画像完整度</dt><dd>{audit.profileCompleteness}%</dd></div>
        <div><dt>推荐可用性</dt><dd>{audit.recommendationReadiness}</dd></div>
        <div><dt>剧透风险</dt><dd>{audit.spoilerRisk}</dd></div>
        <div><dt>标签可信度</dt><dd>{audit.tagConfidence}</dd></div>
      </dl>
      <div className="admin-agent-suggestions">
        <span>Agent 建议</span>
        <ol>
          {audit.suggestions.slice(0, 4).map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ol>
      </div>
      {profile ? (
        <>
          <p className="admin-ai-profile-pitch">{profile.spoilerFreePitch}</p>
          <div className="admin-ai-profile-tags">
            {[...profile.themes, ...profile.moods, ...profile.twistTypes, ...profile.suitableFor].slice(0, 10).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <dl className="admin-ai-profile-grid">
            <div><dt>强度</dt><dd>血腥 {profile.intensity.gore} / 恐怖 {profile.intensity.horror}</dd></div>
            <div><dt>情绪</dt><dd>压抑 {profile.intensity.sadness} / 荒诞 {profile.intensity.absurdity}</dd></div>
            <div><dt>问数</dt><dd>预计 {profile.estimatedQuestions} 问</dd></div>
            <div><dt>版本</dt><dd>v{profile.profileVersion}</dd></div>
          </dl>
          {profile.contentWarnings.length > 0 && (
            <p className="admin-ai-profile-warning">内容提醒：{profile.contentWarnings.join("、")}</p>
          )}
        </>
      ) : (
        <p className="admin-ai-profile-empty">暂无 AI 画像。生成后首页开局导演会使用它匹配口味、强度和推荐理由。</p>
      )}
    </section>
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

function getImageItemsBytes(items: Array<{ file: File }>) {
  return items.reduce((sum, item) => sum + item.file.size, 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
