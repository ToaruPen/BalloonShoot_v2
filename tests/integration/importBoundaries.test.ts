import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = process.cwd();

const listTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry);

    if (statSync(absolute).isDirectory()) {
      return listTsFiles(absolute);
    }

    return absolute.endsWith(".ts") ? [absolute] : [];
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
  it("keeps the game entry out of diagnostic workbench modules", () => {
    const imports = importsFrom(join(rootDir, "src/main.ts"));

    expect(imports.join("\n")).not.toContain("diagnostic-workbench");
  });

  it("keeps app files out of diagnostic workbench modules", () => {
    const appFiles = listTsFiles(join(rootDir, "src/app"));
    const offenders = appFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        specifier.includes("diagnostic-workbench")
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps gameplay from importing side-trigger directly", () => {
    const gameplayFiles = listTsFiles(join(rootDir, "src/features/gameplay"));
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
    const sideTriggerFiles = listTsFiles(
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
    const frontAimFiles = listTsFiles(join(rootDir, "src/features/front-aim"));
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
