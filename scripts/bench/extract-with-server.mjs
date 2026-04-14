#!/usr/bin/env node

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HOST = process.env["BENCH_HOST"] ?? "127.0.0.1";
const PORT = Number(process.env["BENCH_PORT"] ?? "4173");
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const canReachBenchPage = async (url) => {
  try {
    const response = await globalThis.fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForBenchServer = async (host, startingPort, timeoutMs = 60_000) => {
  const startedAt = Date.now();
  const maxOffset = 10;

  while (Date.now() - startedAt < timeoutMs) {
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const url = `http://${host}:${String(startingPort + offset)}/bench.html`;
      if (await canReachBenchPage(url)) {
        return url.replace(/\/bench\.html$/, "");
      }
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for Vite dev server near port ${String(startingPort)}`);
};

const waitForServer = async (url, timeoutMs = 60_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return;
    } catch {
      // Dev server not ready yet.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for Vite dev server at ${url}`);
};

const runCommand = (command, args, env = process.env) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${command} exited via signal ${signal}`));
        return;
      }

      if (code !== 0) {
        rejectRun(new Error(`${command} exited with code ${String(code)}`));
        return;
      }

      resolveRun(undefined);
    });
  });

let server;
let baseUrl = process.env["BENCH_BASE_URL"] ?? `http://${HOST}:${String(PORT)}`;

const stopServer = () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
  }
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    process.exitCode = 1;
  });
}

try {
  if (!(await canReachBenchPage(`${baseUrl}/bench.html`))) {
    server = spawn(
      npmCommand,
      ["run", "dev", "--", "--host", HOST, "--port", String(PORT)],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          BROWSER: "none"
        }
      }
    );

    baseUrl = await waitForBenchServer(HOST, PORT);
  }

  await waitForServer(`${baseUrl}/bench.html`);
  await runCommand(process.execPath, ["scripts/bench/extract.mjs"], {
    ...process.env,
    BENCH_BASE_URL: baseUrl
  });
} finally {
  stopServer();
}
