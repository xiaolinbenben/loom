import { serve } from "@hono/node-server";
import { adminAccountNotice, ensureAdminAccount } from "./admin-account.js";
import { createApp } from "./app.js";
import { markInterruptedTasks } from "./db.js";
import { publicError } from "./errors.js";
import { sweepExpiredImages } from "./storage.js";

markInterruptedTasks();
const adminNotice = adminAccountNotice(ensureAdminAccount(), "silent");
if (adminNotice) console.log(adminNotice);
sweepImages();
setInterval(sweepImages, 60 * 60 * 1000);

function sweepImages(): void {
  void sweepExpiredImages().catch((error: unknown) => {
    console.error(publicError(error));
  });
}

const port = Number(process.env.PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT 无效：${process.env.PORT ?? ""}`);
}

serve({ fetch: createApp().fetch, hostname: "127.0.0.1", port }, () => {
  console.log(`Loom 服务已在 http://127.0.0.1:${port} 启动`);
});
