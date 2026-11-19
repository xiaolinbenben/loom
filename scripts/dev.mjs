import { spawn } from "node:child_process";

const children = ["server", "web", "admin"].map((name) =>
  spawn("npm", ["--prefix", name, "run", "dev"], { stdio: "inherit" }),
);

let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 200);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 0);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
