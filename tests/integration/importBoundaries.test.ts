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
import { dirname, isAbsolute, join, relative, resolve, win32 } from "node:path";

const rootDir = process.cwd();
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
]);

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
    /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
  const imports: string[] = [];
  let match = importRegex.exec(source);

  while (match !== null) {
    imports.push(match[1] ?? match[2] ?? match[3] ?? "");
    match = importRegex.exec(source);
  }

  return imports;
};

const relativeSourcePath = (absolutePath: string): string =>
  relative(rootDir, absolutePath);

const resolveImportSpecifier = (
  sourceFile: string,
  specifier: string,
  projectRoot = rootDir
): string | undefined => {
  if (specifier.startsWith(".")) {
    return resolve(dirname(sourceFile), specifier);
  }

  if (specifier.startsWith("src/")) {
    return resolve(projectRoot, specifier);
  }

  return undefined;
};

const usesWindowsSeparators = (path: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(path) || path.includes("\\");

const isSameOrInsidePath = (
  resolved: string,
  forbiddenRoot: string
): boolean => {
  const pathModule =
    usesWindowsSeparators(resolved) || usesWindowsSeparators(forbiddenRoot)
      ? win32
      : { isAbsolute, relative };
  const relativePath = pathModule.relative(forbiddenRoot, resolved);

  return (
    resolved === forbiddenRoot ||
    (relativePath !== "" &&
      !relativePath.startsWith("..") &&
      !pathModule.isAbsolute(relativePath))
  );
};

const importsForbiddenPath = (
  sourceFile: string,
  specifier: string,
  forbiddenPath: string,
  projectRoot = rootDir
): boolean => {
  const resolved = resolveImportSpecifier(sourceFile, specifier, projectRoot);
  const forbiddenRoot = resolve(forbiddenPath);

  return resolved !== undefined && isSameOrInsidePath(resolved, forbiddenRoot);
};

const gameplayForbiddenSpecifiers = [
  "front-aim",
  "side-trigger",
  "input-fusion",
  "features/camera",
  "hand-tracking",
  "diagnostic-workbench"
];

const gameplayBoundaryOffenders = (
  gameplayFiles: readonly string[],
  projectRoot = rootDir
): string[] =>
  gameplayFiles.filter((file) =>
    importsFrom(file).some(
      (specifier) =>
        gameplayForbiddenSpecifiers.some((forbiddenPart) =>
          specifier.includes(forbiddenPart)
        ) ||
        importsForbiddenPath(
          file,
          specifier,
          join(projectRoot, "src/app"),
          projectRoot
        )
    )
  );

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
      expect(
        listSourceFiles(dir)
          .map((file) => file.slice(dir.length))
          .sort()
      ).toEqual([
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
    const forbidden = ["diagnostic-workbench"];
    const offenders = appFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        forbidden.some((forbiddenPart) => specifier.includes(forbiddenPart))
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps gameplay from importing raw lanes, browser adapters, and app shell directly", () => {
    const gameplayFiles = listSourceFiles(
      join(rootDir, "src/features/gameplay")
    );
    const offenders = gameplayBoundaryOffenders(gameplayFiles);

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("catches gameplay imports from input-fusion modules", () => {
    const dir = join(
      tmpdir(),
      `balloon-gameplay-boundary-${String(process.pid)}`
    );
    const gameplayDir = join(dir, "src/features/gameplay");
    const fusionDir = join(dir, "src/features/input-fusion");
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(gameplayDir, { recursive: true });
    mkdirSync(fusionDir, { recursive: true });
    writeFileSync(join(fusionDir, "mapper.ts"), "export const mapper = {};\n");
    writeFileSync(
      join(gameplayDir, "violates.ts"),
      'import { mapper } from "../input-fusion/mapper";\nexport const leaked = mapper;\n'
    );

    try {
      const gameplayFiles = listSourceFiles(gameplayDir);
      const offenders = gameplayBoundaryOffenders(gameplayFiles, dir);

      expect(offenders.map((file) => relative(dir, file))).toEqual([
        "src/features/gameplay/violates.ts"
      ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("catches gameplay side-effect imports from input-fusion modules", () => {
    const dir = join(
      tmpdir(),
      `balloon-gameplay-side-effect-boundary-${String(process.pid)}`
    );
    const gameplayDir = join(dir, "src/features/gameplay");
    const fusionDir = join(dir, "src/features/input-fusion");
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(gameplayDir, { recursive: true });
    mkdirSync(fusionDir, { recursive: true });
    writeFileSync(join(fusionDir, "dummy.ts"), "export const dummy = {};\n");
    writeFileSync(
      join(gameplayDir, "violates.ts"),
      'import "../input-fusion/dummy";\nexport const gameplay = {};\n'
    );

    try {
      const gameplayFiles = listSourceFiles(gameplayDir);
      const offenders = gameplayBoundaryOffenders(gameplayFiles, dir);

      expect(offenders.map((file) => relative(dir, file))).toEqual([
        "src/features/gameplay/violates.ts"
      ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
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
    const frontAimFiles = listSourceFiles(
      join(rootDir, "src/features/front-aim")
    );
    const offenders = frontAimFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        forbidden.some((forbiddenPart) => specifier.includes(forbiddenPart))
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("keeps input-fusion independent of browser, workbench, rendering, gameplay, and app layers", () => {
    const forbidden = [
      "diagnostic-workbench",
      "hand-tracking",
      "features/camera",
      "../camera",
      "rendering",
      "gameplay",
      "src/app"
    ];
    const fusionFiles = listSourceFiles(
      join(rootDir, "src/features/input-fusion")
    );
    const offenders = fusionFiles.filter((file) =>
      importsFrom(file).some((specifier) =>
        forbidden.some((forbiddenPart) =>
          forbiddenPart === "src/app"
            ? importsForbiddenPath(file, specifier, join(rootDir, "src/app"))
            : specifier.includes(forbiddenPart)
        )
      )
    );

    expect(offenders.map(relativeSourcePath)).toEqual([]);
  });

  it("catches input-fusion app imports written as relative paths", () => {
    const dir = join(
      tmpdir(),
      `balloon-import-boundary-${String(process.pid)}`
    );
    const fusionDir = join(dir, "src/features/input-fusion");
    const appDir = join(dir, "src/app");
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(fusionDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "state.ts"), "export const state = {};\n");
    writeFileSync(
      join(fusionDir, "violates.ts"),
      'import { state } from "../../app/state";\nexport const leaked = state;\n'
    );

    try {
      const fusionFiles = listSourceFiles(fusionDir);
      const offenders = fusionFiles.filter((file) =>
        importsFrom(file).some((specifier) =>
          importsForbiddenPath(file, specifier, appDir, dir)
        )
      );

      expect(offenders.map((file) => relative(dir, file))).toEqual([
        "src/features/input-fusion/violates.ts"
      ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("detects forbidden subpaths with Windows path separators", () => {
    expect(
      isSameOrInsidePath("C:\\repo\\src\\app\\state", "C:\\repo\\src\\app")
    ).toBe(true);
  });

  it("keeps threshold slider labels out of index.html", () => {
    const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");

    expect(indexHtml).not.toContain("SIDE_TRIGGER_PULL_ENTER_THRESHOLD");
    expect(indexHtml).not.toContain("data-side-trigger-tuning");
    expect(indexHtml).not.toContain("FUSION_MAX_PAIR_DELTA_MS");
    expect(indexHtml).not.toContain("data-fusion-tuning");
    expect(indexHtml).not.toContain("DEFAULT_FRONT_AIM_CENTER_X");
    expect(indexHtml).not.toContain("DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE");
    expect(indexHtml).not.toContain("data-front-aim-calibration");
    expect(indexHtml).not.toContain("data-side-trigger-calibration");
    expect(indexHtml).not.toContain("wb-fusion-panel");
    expect(indexHtml).not.toContain("pairedFrontAndSide");
    expect(indexHtml).not.toContain("timestampGapTooLarge");
    expect(indexHtml).not.toContain("diagnostic.html");
  });
});
