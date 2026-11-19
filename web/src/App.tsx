import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

interface DeliveredAgent {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  currency: "CNY";
  outputName: string;
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
  const [agent, setAgent] = useState<DeliveredAgent | null>(null);
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
  const booted = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const items = selectedId ? threads[selectedId] : undefined;
  const draft = selectedId ? followUp : note;
  const canSend = Boolean(agent?.ready) && (selectedId ? draft.trim().length > 0 : draft.trim().length > 0 || files.length > 0);
  const currentStep = activeStep(selected, items);

  async function loadTasks(select?: string) {
    const response = await fetch("/api/tasks");
    const body = (await response.json()) as { tasks?: Task[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "任务列表加载失败");
    const next = body.tasks ?? [];
    setTasks(next);
    if (select) {
      setSelectedId(select);
      return;
    }
    if (!booted.current) {
      booted.current = true;
      const latest = next[0];
      if (latest) setSelectedId(latest.id);
    }
  }

  useEffect(() => {
    void fetch("/api/agent")
      .then(async (response) => {
        const body = (await response.json()) as { agent?: DeliveredAgent; error?: string };
        if (!response.ok || !body.agent) throw new Error(body.error ?? "智能体加载失败");
        setAgent(body.agent);
        document.title = body.agent.name;
      })
      .catch((reason: unknown) => setBootError(messageOf(reason)));
    void loadTasks().catch((reason: unknown) => setError(messageOf(reason)));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const taskId = selectedId;
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
  }, [selectedId]);

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
  }, [draft, selectedId]);

  function setDraft(value: string) {
    if (selectedId) setFollowUp(value);
    else setNote(value);
  }

  async function sendNew() {
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("note", note);
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
    if (!selectedId) return;
    const taskId = selectedId;
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
    if (selectedId) void sendFollowUp();
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
    if (selectedId) return;
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
        <div className="px-5 pt-6">
          <p className="text-[11px] tracking-[0.28em] text-[#c8b8a4]">LOOM</p>
          <h1 className="mt-3 font-serif text-[28px] leading-none">{agent.name}</h1>
          <p className="mt-3 text-sm leading-6 text-[#d9d0c3]">{agent.summary}</p>
          <p className="mt-5 flex items-baseline gap-1">
            <span className="font-serif text-3xl">¥{agent.monthlyPrice}</span>
            <span className="text-sm text-[#c8b8a4]">/ 月</span>
          </p>
          <p className="mt-1 text-xs text-[#a89886]">订阅价，付款尚未开通</p>
        </div>
        <button
          className="mx-5 mt-5 rounded-full border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
          type="button"
          onClick={() => {
            setSelectedId(null);
            setError(null);
          }}
        >
          新任务
        </button>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {tasks.length === 0 ? <p className="px-2 py-2 text-sm text-[#a89886]">还没有任务</p> : null}
          <ul className="space-y-1">
            {tasks.map((task) => {
              const active = task.id === selectedId;
              return (
                <li key={task.id}>
                  <button
                    className={`w-full rounded-2xl px-3 py-2.5 text-left ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                    type="button"
                    onClick={() => {
                      setSelectedId(task.id);
                      setError(null);
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
        <a className="border-t border-white/10 px-5 py-4 text-sm text-[#d9d0c3] hover:text-white" href="/admin/">
          模型配置
        </a>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[#e4d8c8] px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{selected ? taskTitle(selected, items) : "新任务"}</p>
              {selected ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6f655b]">
                  <Dot status={selected.status} />
                  {statusText[selected.status]}
                </p>
              ) : (
                <p className="mt-1 text-xs text-[#6f655b]">把商品资料交给这个智能体</p>
              )}
            </div>
            {selected?.downloadable ? (
              <a className="shrink-0 rounded-full bg-[#8c3f2a] px-4 py-2 text-sm text-white" href={`/api/tasks/${selected.id}/download`}>
                下载上架表
              </a>
            ) : null}
          </div>
          <ol className="mt-4 flex gap-2 overflow-x-auto">
            {agent.workflow.map((step, index) => {
              const state = index < currentStep ? "done" : index === currentStep ? "current" : "waiting";
              const failedHere = selected?.status === "failed" && state === "current";
              return (
                <li key={step.title} className="flex min-w-0 items-center gap-2">
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                      failedHere
                        ? "bg-red-700 text-white"
                        : state === "done"
                          ? "bg-[#2f6b4f] text-white"
                          : state === "current"
                            ? "bg-[#221e1a] text-white"
                            : "bg-[#e7dfd2] text-[#6f655b]"
                    } ${state === "current" && selected?.status === "running" ? "animate-pulse" : ""}`}
                  >
                    {index + 1}
                  </span>
                  <span className={`truncate text-sm ${state === "waiting" ? "text-[#8a7d70]" : ""}`}>{step.title}</span>
                  {index < agent.workflow.length - 1 ? <span className="px-1 text-[#d3c6b4]">—</span> : null}
                </li>
              );
            })}
          </ol>
          <details className="mt-4 xl:hidden">
            <summary className="cursor-pointer text-sm text-[#6f655b]">查看任务、规则和技能</summary>
            <div className="pt-5">
              <Contract agent={agent} />
            </div>
          </details>
        </header>
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-6 py-8">
            {!selected && (items?.length ?? 0) === 0 ? (
              <div className="flex flex-1 flex-col justify-center pb-8">
                <p className="font-serif text-4xl leading-tight">把资料交过来</p>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#6f655b]">{agent.summary} 规则、技能和流程已经配好。</p>
                <ol className="mt-8 grid gap-3 sm:grid-cols-2 xl:hidden">
                  {agent.workflow.map((step, index) => (
                    <li key={step.title} className="rounded-2xl border border-[#e4d8c8] bg-[#fffcf7] px-4 py-3">
                      <p className="text-xs tracking-wide text-[#8a7d70]">0{index + 1}</p>
                      <p className="mt-1 font-medium">{step.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#6f655b]">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {selected && (items?.length ?? 0) === 0 ? (
              <p className="text-sm leading-6 text-[#6f655b]">
                {selected.status === "running"
                  ? "正在处理这个任务…"
                  : selected.downloadable
                    ? "这次执行过程没有保留。上架表还在，可以直接下载。"
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
            {selected?.downloadable ? (
              <a className="rounded-3xl border border-[#d7c7ae] bg-[#fffcf7] px-5 py-4" href={`/api/tasks/${selected.id}/download`}>
                <p className="text-xs tracking-wide text-[#8a7d70]">交付结果</p>
                <p className="mt-1 font-medium">上架表已经生成</p>
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
            if (selectedId) return;
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
          {!selectedId && files.length > 0 ? (
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
            {selectedId ? null : (
              <div className="flex items-center justify-between px-2 pt-1">
                <input ref={fileRef} className="hidden" type="file" multiple onChange={onFiles} />
                <button className="rounded-full px-2 py-1 text-sm text-[#6f655b] hover:bg-[#f3efe6] hover:text-[#241f1a]" type="button" onClick={() => fileRef.current?.click()}>
                  添加商品资料
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
                placeholder={selectedId ? "继续补充要求" : "补充说明：卖什么、哪个平台、价格或要强调的卖点"}
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
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[#e4d8c8] bg-[#f7f3eb] px-5 py-6 xl:block">
        <Contract agent={agent} />
      </aside>
    </div>
  );
}

function Contract({ agent }: { agent: DeliveredAgent }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs tracking-[0.18em] text-[#8a7d70]">会做的事</h2>
        <ol className="mt-3 space-y-2 text-sm leading-6">
          {agent.tasks.map((task) => (
            <li key={task} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-[#c4654a]" />
              <span>{task}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="text-xs tracking-[0.18em] text-[#8a7d70]">遵守的规则</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {agent.rules.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-[#c4654a]" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xs tracking-[0.18em] text-[#8a7d70]">使用的技能</h2>
        <ul className="mt-3 space-y-2">
          {agent.skills.map((skill) => (
            <li key={skill.name}>
              <a className="block rounded-2xl border border-[#e4d8c8] bg-[#fffcf7] px-3 py-2 hover:border-[#c4654a]" href={skill.source}>
                <span className="block text-sm font-medium">{skill.name}</span>
                <span className="mt-0.5 block text-xs text-[#6f655b]">安装自 food4agent</span>
              </a>
            </li>
          ))}
        </ul>
        {!agent.ready ? <p className="mt-2 text-xs leading-5 text-[#8c3f2a]">尚未安装</p> : null}
      </section>
      <section>
        <h2 className="text-xs tracking-[0.18em] text-[#8a7d70]">任务流程</h2>
        <ol className="mt-3 space-y-3">
          {agent.workflow.map((step, index) => (
            <li key={step.title}>
              <p className="text-sm font-medium">
                {index + 1}. {step.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[#6f655b]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function activeStep(task: Task | null, items: Item[] | undefined): number {
  if (!task) return 0;
  if (task.downloadable) return 4;
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
