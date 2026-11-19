import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

interface DeliveredAgent {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  currency: "CNY";
  included: boolean;
  headline: string;
  inputLabel: string;
  placeholder: string;
  outputName: string | null;
  resultName: string | null;
  tasks: string[];
  rules: string[];
  workflow: { title: string; detail: string }[];
  skills: { name: string; source: string }[];
  ready: boolean;
  missingSkills: string[];
}

interface Task {
  id: string;
  status: "running" | "succeeded" | "failed";
  agent: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  downloadable: boolean;
}

type Item =
  | { id: string; kind: "user"; text: string; files: string[] }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "tool"; label: string; detail: string };

const statusText: Record<Task["status"], string> = {
  running: "进行中",
  succeeded: "可下载",
  failed: "失败",
};

export function App() {
  const [agents, setAgents] = useState<DeliveredAgent[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Item[]>>({});
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hiredIds, setHiredIds] = useState<string[]>(() => readHiredAgents());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const agent = agents.find((item) => item.id === agentId) ?? null;
  const selected = tasks.find((task) => task.id === selectedId && task.agent === agent?.id) ?? null;
  const activeTaskId = selected?.id ?? null;
  const visibleTasks = tasks.filter((task) => task.agent === agent?.id);
  const items = activeTaskId ? threads[activeTaskId] : undefined;
  const draft = activeTaskId ? followUp : note;
  const hired = Boolean(agent && (agent.included || hiredIds.includes(agent.id)));
  const canSend = Boolean(agent?.ready) && (activeTaskId ? draft.trim().length > 0 : hired && (draft.trim().length > 0 || files.length > 0));
  const currentStep = activeStep(selected, items);
  const quiet = !activeTaskId && (items?.length ?? 0) === 0;

  async function loadTasks(select?: string) {
    const response = await fetch("/api/tasks");
    const body = (await response.json()) as { tasks?: Task[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "任务列表加载失败");
    const next = body.tasks ?? [];
    setTasks(next);
    if (select) setSelectedId(select);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [agentResponse, taskResponse] = await Promise.all([fetch("/api/agents"), fetch("/api/tasks")]);
        const agentBody = (await agentResponse.json()) as { agents?: DeliveredAgent[]; error?: string };
        const taskBody = (await taskResponse.json()) as { tasks?: Task[]; error?: string };
        if (!agentResponse.ok || !agentBody.agents?.length) throw new Error(agentBody.error ?? "智能体加载失败");
        if (!taskResponse.ok) throw new Error(taskBody.error ?? "任务列表加载失败");
        if (cancelled) return;
        const list = agentBody.agents;
        const current = list.find((item) => item.included);
        if (!current) throw new Error("没有默认雇佣的智能体");
        setAgents(list);
        setAgentId(current.id);
        document.title = current.name;
        const nextTasks = taskBody.tasks ?? [];
        setTasks(nextTasks);
        const latest = nextTasks.find((task) => task.agent === current.id);
        if (latest) setSelectedId(latest.id);
      } catch (reason: unknown) {
        if (!cancelled) setBootError(messageOf(reason));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTaskId) return;
    const taskId = activeTaskId;
    const source = new EventSource(`/api/tasks/${taskId}/events`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type?: string;
        status?: Task["status"];
        error?: string | null;
        downloadable?: boolean;
        text?: string;
        label?: string;
        detail?: string;
      };
      if (data.type === "reset") {
        setThreads((current) => ({
          ...current,
          [taskId]: (current[taskId] ?? []).filter((item) => item.kind === "user"),
        }));
        return;
      }
      if (data.type === "status" && data.status) {
        setTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: data.status ?? task.status,
                  error: data.error ?? null,
                  downloadable: Boolean(data.downloadable),
                }
              : task,
          ),
        );
        return;
      }
      if (data.type === "text" && data.text) {
        const text = data.text;
        setThreads((current) => {
          const list = current[taskId] ?? [];
          const last = list.at(-1);
          if (last?.kind === "text") {
            return { ...current, [taskId]: [...list.slice(0, -1), { ...last, text: last.text + text }] };
          }
          return { ...current, [taskId]: [...list, { id: crypto.randomUUID(), kind: "text", text }] };
        });
        return;
      }
      if (data.type === "tool" && data.label) {
        const label = data.label;
        const detail = data.detail ?? "";
        setThreads((current) => ({
          ...current,
          [taskId]: [...(current[taskId] ?? []), { id: crypto.randomUUID(), kind: "tool", label, detail }],
        }));
      }
    };
    return () => source.close();
  }, [activeTaskId]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [items, selected?.error, selected?.status]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [draft, activeTaskId]);

  function setDraft(value: string) {
    if (activeTaskId) setFollowUp(value);
    else setNote(value);
  }

  function openAgent(id: string) {
    if (id === agentId) return;
    const next = agents.find((item) => item.id === id);
    if (!next) return;
    setAgentId(id);
    setSelectedId(null);
    setError(null);
    setSettingsOpen(false);
    setNote("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    document.title = next.name;
  }

  function hireAgent(id: string) {
    const target = agents.find((item) => item.id === id);
    if (!target?.ready || target.included || hiredIds.includes(target.id)) return;
    const next = [...hiredIds, target.id];
    writeHiredAgents(next);
    setHiredIds(next);
    openAgent(target.id);
  }

  async function sendNew() {
    if (!agent) return;
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("note", note);
      form.append("agent", agent.id);
      const response = await fetch("/api/tasks", { method: "POST", body: form });
      const body = (await response.json()) as { task?: Task; error?: string };
      if (!response.ok || !body.task) throw new Error(body.error ?? "创建任务失败");
      const task = body.task;
      setThreads((current) => ({
        ...current,
        [task.id]: [{ id: crypto.randomUUID(), kind: "user", text: note.trim(), files: files.map((file) => file.name) }],
      }));
      setNote("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      await loadTasks(task.id);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendFollowUp() {
    if (!activeTaskId) return;
    const taskId = activeTaskId;
    const text = followUp.trim();
    setError(null);
    setFollowUp("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json()) as { task?: Task; error?: string };
      if (!response.ok || !body.task) throw new Error(body.error ?? "发送失败");
      const task = body.task;
      setThreads((current) => ({
        ...current,
        [task.id]: [...(current[task.id] ?? []), { id: crypto.randomUUID(), kind: "user", text, files: [] }],
      }));
      setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, ...task } : item)));
    } catch (reason) {
      setFollowUp(text);
      setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !canSend) return;
    if (activeTaskId) void sendFollowUp();
    else void sendNew();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    if (activeTaskId) return;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) setFiles(dropped);
  }

  if (!agent) {
    return (
      <main className="grid h-dvh place-items-center bg-[#f3efe6] px-6 text-[#241f1a]">
        <p className="max-w-md text-center text-sm leading-6">{bootError ?? "正在打开智能体…"}</p>
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f3efe6] text-[#241f1a]">
      <aside className="flex w-[272px] shrink-0 flex-col bg-[#221e1a] text-[#f6f1e7]">
        <div className="flex items-center gap-3 px-5 pt-6">
          <p className="shrink-0 text-[11px] tracking-[0.28em] text-[#c8b8a4]">LOOM</p>
          <span className="h-4 w-px shrink-0 bg-white/20" />
          <p className="min-w-0 truncate font-serif text-[22px] leading-none">{agent.name}</p>
        </div>
        {hired ? (
          <button
            className="mx-4 mt-6 rounded-full bg-[#f6f1e7] px-3 py-2.5 text-sm font-medium text-[#221e1a] hover:bg-white"
            type="button"
            onClick={() => {
              setSelectedId(null);
              setError(null);
              setSettingsOpen(false);
            }}
          >
            新任务
          </button>
        ) : null}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {visibleTasks.length === 0 ? <p className="px-2 py-2 text-sm text-[#a89886]">还没有任务</p> : null}
          <ul className="space-y-1">
            {visibleTasks.map((task) => {
              const active = task.id === activeTaskId;
              return (
                <li key={task.id}>
                  <button
                    className={`w-full rounded-2xl px-3 py-2.5 text-left ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                    type="button"
                    onClick={() => {
                      setSelectedId(task.id);
                      setError(null);
                      setSettingsOpen(false);
                    }}
                  >
                    <span className="block truncate text-sm">{taskTitle(task, threads[task.id])}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-[#c8b8a4]">
                      <Dot status={task.status} />
                      {statusText[task.status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <button
          className={`flex w-full items-center gap-3 border-t border-white/10 px-5 py-4 text-left ${settingsOpen ? "bg-white/10" : "hover:bg-white/5"}`}
          type="button"
          aria-pressed={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-[#f6f1e7]">
            <UserMark />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-[#f6f1e7]">设置</span>
            <span className="block truncate text-xs text-[#a89886]">切换智能体</span>
          </span>
        </button>
      </aside>
      {settingsOpen ? (
        <SettingsPanel agents={agents} currentId={agent.id} hiredIds={hiredIds} onSwitch={openAgent} onHire={hireAgent} />
      ) : (
      <>
      <section className={`flex min-w-0 flex-1 flex-col ${quiet ? "justify-center" : ""}`}>
        <div ref={scrollerRef} className={quiet ? "hidden" : "min-h-0 flex-1 overflow-y-auto"}>
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-6 py-8">
            {selected && (items?.length ?? 0) === 0 ? (
              <p className="text-sm leading-6 text-[#6f655b]">
                {selected.status === "running"
                  ? "正在处理这个任务…"
                  : selected.downloadable && agent.resultName
                    ? `这次执行过程没有保留。${agent.resultName}还在，可以直接下载。`
                    : "刷新后，已经结束的对话不会回放。新的进度会显示在这里。"}
              </p>
            ) : null}
            {(items ?? []).map((item) =>
              item.kind === "user" ? (
                <div key={item.id} className="ml-auto max-w-[85%] rounded-3xl rounded-br-lg bg-[#221e1a] px-4 py-3 text-sm leading-6 text-[#f6f1e7]">
                  {item.files.length > 0 ? <p className="mb-1 text-xs text-[#d9d0c3]">{item.files.join("、")}</p> : null}
                  {item.text ? <p className="whitespace-pre-wrap">{item.text}</p> : null}
                </div>
              ) : item.kind === "tool" ? (
                <div key={item.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#c4654a]" />
                  <p className="min-w-0 leading-6">
                    <span>{item.label}</span>
                    {item.detail ? <span className="text-[#6f655b]"> · {item.detail}</span> : null}
                  </p>
                </div>
              ) : (
                <div key={item.id} className="max-w-3xl">
                  <p className="text-xs tracking-wide text-[#8a7d70]">{agent.name}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-7">{item.text}</p>
                </div>
              ),
            )}
            {selected?.downloadable && agent.resultName && agent.outputName ? (
              <a className="rounded-3xl border border-[#d7c7ae] bg-[#fffcf7] px-5 py-4" href={`/api/tasks/${selected.id}/download`}>
                <p className="text-xs tracking-wide text-[#8a7d70]">交付结果</p>
                <p className="mt-1 font-medium">{agent.resultName}已经生成</p>
                <p className="mt-1 text-sm text-[#6f655b]">{agent.outputName}</p>
              </a>
            ) : null}
            {selected?.error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{selected.error}</p> : null}
          </div>
        </div>
        <form
          className="mx-auto w-full max-w-3xl shrink-0 px-6 pb-5"
          onSubmit={onSubmit}
          onDragOver={(event) => {
            if (activeTaskId) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {error ? <p className="mb-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
          {!agent.ready ? (
            <p className="mb-2 rounded-2xl bg-[#fff4e8] px-4 py-3 text-sm leading-6 text-[#8c3f2a]">
              技能还没有安装：{agent.missingSkills.join("、")}。在仓库根目录运行 npm run install-skills
            </p>
          ) : null}
          {!activeTaskId && files.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full border border-[#e4d8c8] bg-[#fffcf7] px-3 py-1 text-xs">
                  <span className="max-w-48 truncate">{file.name}</span>
                  <button
                    className="text-[#8a7d70] hover:text-[#241f1a]"
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() => {
                      setFiles((current) => current.filter((_, item) => item !== index));
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={`rounded-3xl border bg-[#fffcf7] p-2 shadow-[0_10px_30px_rgba(36,31,26,0.05)] ${dragging ? "border-[#8c3f2a]" : "border-[#e4d8c8]"}`}>
            {activeTaskId ? null : (
              <div className="flex items-center justify-between px-2 pt-1">
                <input ref={fileRef} className="hidden" type="file" multiple onChange={onFiles} />
                <button className="rounded-full px-2 py-1 text-sm text-[#6f655b] hover:bg-[#f3efe6] hover:text-[#241f1a]" type="button" onClick={() => fileRef.current?.click()}>
                  {agent.inputLabel}
                </button>
                <span className="pr-2 text-xs text-[#a89886]">也可以拖到这里</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none"
                rows={1}
                value={draft}
                placeholder={activeTaskId ? "继续补充要求" : agent.placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <button className="mb-1 rounded-full bg-[#8c3f2a] px-4 py-2 text-sm text-white disabled:opacity-30" type="submit" disabled={submitting || !canSend}>
                {submitting ? "发送中" : "发送"}
              </button>
            </div>
          </div>
          <p className="px-3 pt-2 text-center text-xs text-[#a89886]">Enter 发送，Shift+Enter 换行</p>
        </form>
      </section>
      <Guide agent={agent} task={selected} items={items} step={currentStep} />
      </>
      )}
    </div>
  );
}

function activeStep(task: Task | null, items: Item[] | undefined): number {
  if (!task) return 0;
  if (task.status === "succeeded") return 4;
  if (items?.some((item) => item.kind === "tool")) return 2;
  return 1;
}

function taskTitle(task: Task, items: Item[] | undefined): string {
  const user = items?.find((item): item is Extract<Item, { kind: "user" }> => item.kind === "user");
  const line = user?.text.trim().split("\n")[0];
  if (line) return line.length > 24 ? `${line.slice(0, 24)}…` : line;
  if (user?.files[0]) return user.files[0];
  return new Date(task.createdAt).toLocaleString();
}

function Dot({ status }: { status: Task["status"] }) {
  const color = status === "succeeded" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-amber-300";
  return <span className={`inline-block size-1.5 rounded-full ${color} ${status === "running" ? "animate-pulse" : ""}`} />;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : "请求失败";
}

const hiredAgentsKey = "loom.hired-agents";

function readHiredAgents(): string[] {
  try {
    const value = localStorage.getItem(hiredAgentsKey);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  } catch {
    return [];
  }
}

function writeHiredAgents(ids: string[]) {
  localStorage.setItem(hiredAgentsKey, JSON.stringify(ids));
}

function SettingsPanel({
  agents,
  currentId,
  hiredIds,
  onSwitch,
  onHire,
}: {
  agents: DeliveredAgent[];
  currentId: string;
  hiredIds: string[];
  onSwitch: (id: string) => void;
  onHire: (id: string) => void;
}) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <p className="text-xs tracking-[0.18em] text-[#8a7d70]">设置</p>
        <h2 className="mt-4 font-serif text-5xl leading-none">雇佣的智能体</h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#6f655b]">切换正在使用的智能体。还没雇佣的，先在这里雇佣。</p>
        <ul className="mt-8 space-y-4">
          {agents.map((item) => {
            const employed = item.included || hiredIds.includes(item.id);
            const current = item.id === currentId;
            return (
              <li key={item.id} className={`rounded-3xl border bg-[#fffcf7] px-5 py-5 ${current ? "border-[#241f1a]" : "border-[#e4d8c8]"}`}>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-serif text-3xl leading-none">{item.name}</p>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[#6f655b]">{item.summary}</p>
                    <ul className="mt-3 space-y-1 text-sm leading-6 text-[#6f655b]">
                      {item.tasks.map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="shrink-0">
                    {item.monthlyPrice === 0 ? (
                      <span className="font-serif text-3xl">免费</span>
                    ) : (
                      <>
                        <span className="font-serif text-3xl">¥{item.monthlyPrice}</span>
                        <span className="text-sm text-[#8a7d70]"> / 月</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#a89886]">{item.included ? "默认包含，无需付款" : employed ? "已雇佣" : "订阅价，付款尚未开通"}</p>
                  <button
                    className="rounded-full bg-[#8c3f2a] px-5 py-2.5 text-sm text-white disabled:opacity-40"
                    type="button"
                    disabled={current || !item.ready}
                    onClick={() => (employed ? onSwitch(item.id) : onHire(item.id))}
                  >
                    {current ? "正在使用" : employed ? "切换" : "雇佣"}
                  </button>
                </div>
                {!item.ready ? <p className="mt-3 text-xs leading-5 text-[#8c3f2a]">尚未安装：{item.missingSkills.join("、")}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Guide({ agent, task, items, step }: { agent: DeliveredAgent; task: Task | null; items: Item[] | undefined; step: number }) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#e4d8c8] bg-[#faf6f0]">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <p className="text-xs tracking-[0.18em] text-[#8a7d70]">说明</p>
        <h2 className="mt-3 font-serif text-[32px] leading-tight">{task ? taskTitle(task, items) : "新任务"}</h2>
        <p className="mt-3 text-sm leading-7 text-[#6f655b]">{agent.summary}</p>
        {task ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6f655b]">
            <Dot status={task.status} />
            {statusText[task.status]}
          </p>
        ) : null}
        <ol className="mt-8">
          {agent.workflow.map((item, index) => {
            const state = index < step ? "done" : index === step ? "current" : "waiting";
            const failedHere = task?.status === "failed" && state === "current";
            return (
              <li key={item.title} className="relative flex gap-3 pb-6 last:pb-0">
                {index < agent.workflow.length - 1 ? <span className="absolute top-6 bottom-0 left-3 w-px bg-[#e4d8c8]" /> : null}
                <span
                  className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                    failedHere
                      ? "bg-red-700 text-white"
                      : state === "done"
                        ? "bg-[#2f6b4f] text-white"
                        : state === "current"
                          ? "bg-[#221e1a] text-white"
                          : "bg-[#e7dfd2] text-[#6f655b]"
                  } ${state === "current" && task?.status === "running" ? "animate-pulse" : ""}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm ${state === "waiting" ? "text-[#8a7d70]" : "font-medium"}`}>{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[#6f655b]">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {task?.downloadable && agent.resultName ? (
          <a className="mt-2 block rounded-2xl bg-[#8c3f2a] px-4 py-3 text-center text-sm text-white" href={`/api/tasks/${task.id}/download`}>
            下载{agent.resultName}
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function UserMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 18.5c1.4-2.6 3.6-3.8 6.5-3.8s5.1 1.2 6.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
