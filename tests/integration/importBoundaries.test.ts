import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const rootDir = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const isSourceFile = (path: string): boolean =>
  Array.from(sourceExtensions).some((extension) => path.endsWith(extension));

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry);

    if (statSync(absolute).isDirectory()) {
      return listSourceFiles(absolute);
    }

    return isSourceFile(absolute) ? [absolute] : [];
  });

const importsFrom = (absolutePath: string): string[] => {
  const source = readFileSync(absolutePath, "utf8");
  const importRegex =
    /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const imports: string[] = [];
  let match = importRegex.exec(source);

  while (match !== null) {
    imports.push(match[1] ?? match[2] ?? "");
    match = importRegex.exec(source);
  }

  return imports;
};

const relativeSourcePath = (absolutePath: string): string =>
  relative(rootDir, absolutePath);

describe("M5 import boundaries", () => {
  it("scans TypeScript, JavaScript, and JSX-family source files", () => {
    const dir = join(tmpdir(), `balloon-source-files-${String(process.pid)}`);
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir, { recursive: true });

    for (const extension of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
      writeFileSync(join(dir, `source${extension}`), "export {};\n");
    }
    writeFileSync(join(dir, "README.md"), "# ignored\n");

    try {
      expect(listSourceFiles(dir).map((file) => file.slice(dir.length)).sort())
        .toEqual([
          "/source.cjs",
          "/source.js",
          "/source.jsx",
          "/source.mjs",
          "/source.ts",
          "/source.tsx"
        ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("keeps the game entry out of diagnostic workbench modules", () => {
    const imports = importsFrom(join(rootDir, "src/main.ts"));

    expect(imports.join("\n")).not.toContain("diagnostic-workbench");
  });

  it("keeps app files out of diagnostic workbench modules", () => {
    const appFiles = listSourceFiles(join(rootDir, "src/app"));
    const offenders = appFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        specifier.includes("diagnostic-workbench")
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps gameplay from importing side-trigger directly", () => {
    const gameplayFiles = listSourceFiles(join(rootDir, "src/features/gameplay"));
    const offenders = gameplayFiles.filter((file) =>
      importsFrom(file).some((specifier) => specifier.includes("side-trigger"))
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps side-trigger independent of workbench, aim, fusion, gameplay, and rendering", () => {
    const forbidden = [
      "diagnostic-workbench",
      "front-aim",
      "input-fusion",
      "gameplay",
      "rendering"
    ];
    const sideTriggerFiles = listSourceFiles(
      join(rootDir, "src/features/side-trigger")
    );
    const offenders = sideTriggerFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        forbidden.some((forbiddenPart) => specifier.includes(forbiddenPart))
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps front-aim independent of workbench, trigger, fusion, gameplay, and rendering", () => {
    const forbidden = [
      "diagnostic-workbench",
      "side-trigger",
      "input-fusion",
      "gameplay",
      "rendering"
    ];
    const frontAimFiles = listSourceFiles(join(rootDir, "src/features/front-aim"));
    const offenders = frontAimFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        forbidden.some((forbiddenPart) => specifier.includes(forbiddenPart))
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps threshold slider labels out of index.html", () => {
    const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");

    expect(indexHtml).not.toContain("SIDE_TRIGGER_PULL_ENTER_THRESHOLD");
    expect(indexHtml).not.toContain("data-side-trigger-tuning");
    expect(indexHtml).not.toContain("diagnostic.html");
  });
});
