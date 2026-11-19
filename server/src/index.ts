import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { markInterruptedTasks } from "./db.js";

markInterruptedTasks();

const port = Number(process.env.PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT 无效：${process.env.PORT ?? ""}`);
}

serve({ fetch: createApp().fetch, hostname: "127.0.0.1", port }, () => {
  console.log(`Loom 服务已在 http://127.0.0.1:${port} 启动`);
});
