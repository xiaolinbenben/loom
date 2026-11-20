import { constants as fsConstants } from "node:fs";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createHttpHooks, ReadonlyProvider, RealFSProvider, VM } from "@earendil-works/gondolin";

const guestEnv = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: "/root",
  LANG: "C.UTF-8",
};

function stringEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env ?? guestEnv).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

const sandboxes = new Set<VM>();
let closing: Promise<void> | undefined;

function closeAllSandboxes(): Promise<void> {
  closing ??= (async () => {
    const open = [...sandboxes];
    sandboxes.clear();
    await Promise.allSettled(open.map((vm) => vm.close()));
  })();
  return closing;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void closeAllSandboxes().finally(() => process.exit(0));
  });
}

export async function closeSandbox(vm: VM): Promise<void> {
  sandboxes.delete(vm);
  await vm.close();
}

export async function openTaskSandbox(workspace: string, skillPaths: string[]): Promise<{
  vm: VM;
  tools: ToolDefinition[];
}> {
  const { httpHooks } = createHttpHooks();
  const mounts: Record<string, RealFSProvider | ReadonlyProvider> = {
    [workspace]: new RealFSProvider(workspace),
  };
  for (const skillPath of skillPaths) {
    mounts[skillPath] = new ReadonlyProvider(new RealFSProvider(skillPath));
  }

  let vm: VM;
  try {
    vm = await VM.create({
      httpHooks,
      allowWebSockets: false,
      env: guestEnv,
      vfs: { mounts },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`沙盒启动失败：${message}`);
  }
  sandboxes.add(vm);

  const readOps = {
    readFile: (absolutePath: string) => vm.fs.readFile(absolutePath),
    access: (absolutePath: string) => vm.fs.access(absolutePath, { mode: fsConstants.R_OK }),
  };
  const writeOps = {
    mkdir: (dir: string) => vm.fs.mkdir(dir, { recursive: true }),
    writeFile: (absolutePath: string, content: string) => vm.fs.writeFile(absolutePath, content),
  };
  const tools = [
    createReadToolDefinition(workspace, { operations: readOps }),
    createWriteToolDefinition(workspace, { operations: writeOps }),
    createEditToolDefinition(workspace, {
      operations: {
        readFile: readOps.readFile,
        writeFile: writeOps.writeFile,
        access: (absolutePath: string) => vm.fs.access(absolutePath, { mode: fsConstants.R_OK | fsConstants.W_OK }),
      },
    }),
    createBashToolDefinition(workspace, {
      exposeSessionEnvironment: false,
      spawnHook: ({ command, cwd }) => ({ command, cwd, env: guestEnv }),
      operations: {
        exec: async (command, cwd, { onData, signal, timeout, env }) => {
          const abort = new AbortController();
          const onAbort = () => abort.abort();
          signal?.addEventListener("abort", onAbort, { once: true });
          let timedOut = false;
          const timer =
            timeout && timeout > 0
              ? setTimeout(() => {
                  timedOut = true;
                  abort.abort();
                }, timeout * 1000)
              : undefined;
          try {
            const proc = vm.exec(["/bin/bash", "-lc", command], {
              cwd,
              env: stringEnv(env),
              signal: abort.signal,
              stdout: "pipe",
              stderr: "pipe",
            });
            for await (const chunk of proc.output()) onData(chunk.data);
            const result = await proc;
            return { exitCode: result.signal ? 128 + result.signal : result.exitCode };
          } catch (error) {
            if (signal?.aborted) throw new Error("aborted");
            if (timedOut) throw new Error(`timeout:${timeout}`);
            throw error;
          } finally {
            if (timer) clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
          }
        },
      },
    }),
  ] as ToolDefinition[];
  return { vm, tools };
}
