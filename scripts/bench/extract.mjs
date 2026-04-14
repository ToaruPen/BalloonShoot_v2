#!/usr/bin/env node
/**
 * Drives the bench.html harness in a headless Chromium via Playwright,
 * feeding each video fixture through MediaPipe HandLandmarker and writing
 * a landmark JSON file next to the source video.
 *
 * Requires the Vite dev server to already be running on 127.0.0.1:5173.
 * Usage:
 *   npm run dev               # in one shell
 *   npm run bench:extract     # in another
 *
 * For a single-command local refresh, use:
 *   npm run bench:refresh
 */
import { chromium } from "playwright";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixturesDir = join(repoRoot, "tests", "fixtures", "videos");

const VIDEOS = [
  { label: "right-hand", file: "right-hand.mov", mime: "video/quicktime" },
  { label: "left-hand", file: "left-hand.mov", mime: "video/quicktime" }
];

const BASE_URL = process.env["BENCH_BASE_URL"] ?? "http://127.0.0.1:5173";

const main = async () => {
  // Verify all sources exist before launching the browser.
  for (const { file } of VIDEOS) {
    const path = join(fixturesDir, file);
    if (!existsSync(path)) {
      globalThis.console.error(`Missing fixture: ${path}`);
      process.exitCode = 1;
      return;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      globalThis.console.error(`[page] ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${BASE_URL}/bench.html`);
    await page.waitForFunction(() => globalThis.__benchHarnessReady === true, {
      timeout: 60_000
    });
    for (const { label, file, mime } of VIDEOS) {
      const srcPath = join(fixturesDir, file);
      const bytes = await readFile(srcPath);
      const base64 = bytes.toString("base64");
      globalThis.console.log(`Extracting ${label} (${bytes.length.toLocaleString()} bytes)…`);
      const started = Date.now();
      const result = await page.evaluate(
        async ({ label, base64, mime }) => {
          const binary = globalThis.atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          return globalThis.runExtraction(label, bytes, mime);
        },
        { label, base64, mime }
      );
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const framesWithHand = result.frames.filter((f) => f.frame !== null).length;
      globalThis.console.log(
        `  → ${result.frames.length} frames (${framesWithHand} with hand) in ${elapsed}s`
      );
      const outPath = join(fixturesDir, `${label}.landmarks.json`);
      await writeFile(outPath, JSON.stringify(result));
      globalThis.console.log(`  wrote ${outPath}`);
    }
  } finally {
    await browser.close();
  }
};

await main();
