import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { registerAdmin } from "./admin.js";
import { agentViews, loadAgent } from "./catalog.js";
import { repoRoot } from "./config.js";
import { publicError, RequestError } from "./errors.js";
import { getTask, listTasks } from "./db.js";
import { bufferedEvents, continueTask, createTask, outputPath, statusEvent, subscribe, taskView } from "./tasks.js";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asFiles(value: unknown): File[] {
  if (value instanceof File) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is File => item instanceof File);
}

export function createApp(): Hono {
  const app = new Hono();
  registerAdmin(app);

  app.onError((error, c) => {
    const message = publicError(error);
    console.error(message);
    if (message === "任务不存在") return c.json({ error: message }, 404);
    if (error instanceof RequestError) return c.json({ error: message }, 400);
    return c.json({ error: message }, 500);
  });

  app.get("/api/agents", (c) => c.json({ agents: agentViews() }));

  app.get("/api/tasks", (c) => c.json({ tasks: listTasks().map(taskView) }));

  app.get("/api/tasks/:id", (c) => c.json({ task: taskView(requireTask(c.req.param("id"))) }));

  app.post("/api/tasks", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const note = typeof body.note === "string" ? body.note : "";
    const agent = typeof body.agent === "string" ? body.agent : "";
    const task = await createTask(asFiles(body.files), note, agent);
    return c.json({ task: taskView(task) }, 201);
  });

  app.post("/api/tasks/:id/messages", async (c) => {
    const body: unknown = await c.req.json();
    const text = typeof body === "object" && body !== null && "text" in body ? body.text : undefined;
    if (typeof text !== "string") throw new RequestError("请填写要继续说明的内容");
    const task = continueTask(c.req.param("id"), text);
    return c.json({ task: taskView(task) });
  });

  app.get("/api/tasks/:id/events", (c) => {
    const task = requireTask(c.req.param("id"));
    return streamSSE(c, async (stream) => {
      const send = async (event: unknown) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };
      const snapshot = bufferedEvents(task.id);
      const pending: unknown[] = [];
      let live = false;
      await new Promise<void>((resolve) => {
        const unsubscribe = subscribe(task.id, (event) => {
          if (live) {
            void send(event).catch(() => resolve());
            return;
          }
          pending.push(event);
        });
        void (async () => {
          await send({ type: "reset" });
          const initial = snapshot.length > 0 ? snapshot : [statusEvent(task)];
          for (const event of initial) await send(event);
          live = true;
          for (const event of pending.splice(0)) await send(event);
        })().catch(() => {
          unsubscribe();
          resolve();
        });
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    });
  });

  app.get("/api/tasks/:id/download", (c) => {
    const task = requireTask(c.req.param("id"));
    const agent = loadAgent(task.agent);
    if (!agent.outputName || !agent.resultName) return c.json({ error: "这个智能体没有可下载的文件" }, 404);
    const path = outputPath(task.workspace, agent.outputName);
    if (!existsSync(path)) return c.json({ error: `${agent.resultName}还没有生成` }, 404);
    const filename = agent.outputName;
    return c.body(new Uint8Array(readFileSync(path)), 200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    });
  });

  mountStatic(app);
  return app;
}

function mountStatic(app: Hono): void {
  const webDist = join(repoRoot, "web", "dist");
  const adminDist = join(repoRoot, "admin", "dist");
  if (!existsSync(join(webDist, "index.html")) || !existsSync(join(adminDist, "index.html"))) return;
  app.use("/admin/*", serveStatic({
    root: adminDist,
    rewriteRequestPath: (path) => path.replace(/^\/admin/, "") || "/",
  }));
  app.get("/admin", (c) => c.redirect("/admin/"));
  app.get("/admin/", serveStatic({ path: join(adminDist, "index.html") }));
  app.use("*", serveStatic({ root: webDist }));
}


function requireTask(id: string) {
  if (!idPattern.test(id)) throw new RequestError("任务不存在");
  const task = getTask(id);
  if (!task) throw new RequestError("任务不存在");
  return task;
}
