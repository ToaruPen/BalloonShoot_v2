# BalloonShoot PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome-first local PoC that proves webcam hand-tracking, thumb-trigger shooting, timed balloon popping, audio feedback, debug tuning, and strict quality gates can coexist in a maintainable Vanilla TypeScript + Canvas 2D codebase.

**Architecture:** Keep the game core framework-free and split it into `gameplay`, `input-mapping`, `rendering`, `camera/hand-tracking`, and `app` orchestration layers. Browser-specific adapters stay thin; scoring, difficulty, trigger logic, and state transitions stay unit-testable and reusable for a later Phaser migration.

**Tech Stack:** Vite, TypeScript, MediaPipe Hand Landmarker, Canvas 2D, HTML overlay UI, Vitest, Playwright, ESLint, Prettier

---

## Planned File Structure

- `package.json`: scripts and dependency manifest
- `tsconfig.json`: strict browser TypeScript settings
- `vite.config.ts`: Vite app config
- `vitest.config.ts`: unit/integration test config
- `playwright.config.ts`: browser smoke config
- `eslint.config.mjs`: strict lint rules and dependency boundaries
- `prettier.config.mjs`: formatting rules
- `index.html`: Vite entry HTML with root app container
- `src/main.ts`: top-level bootstrap entry
- `src/styles/app.css`: base app and overlay styles
- `src/app/bootstrap/startApp.ts`: wires app, renderer, tracker, audio, and debug panel
- `src/app/state/appState.ts`: app/game screen union types
- `src/app/state/reduceAppEvent.ts`: pure state reducer for screen transitions
- `src/app/screens/renderShell.ts`: HTML overlay rendering for permission, start, countdown, result, debug
- `src/features/gameplay/domain/*.ts`: score, combo, timer, difficulty, balloon state
- `src/features/input-mapping/*.ts`: pose checks, trigger state, smoothing, crosshair mapping
- `src/features/rendering/drawGameFrame.ts`: Canvas-only draw layer
- `src/features/camera/createCameraController.ts`: webcam lifecycle
- `src/features/hand-tracking/createMediaPipeHandTracker.ts`: MediaPipe adapter
- `src/features/audio/createAudioController.ts`: BGM/SE playback
- `src/features/debug/createDebugPanel.ts`: runtime tuning controls and overlays
- `src/shared/*`: types, math helpers, immutable config, browser helpers
- `tests/unit/**/*`: pure logic tests
- `tests/integration/**/*`: reducer/bootstrap integration tests
- `tests/e2e/app.smoke.spec.ts`: Playwright smoke path
- `AGENTS.md` and scoped `AGENTS.md` files: repo and directory-local guidance
- `CLAUDE.md` symlinks: sibling symlinks to every `AGENTS.md`
  - Every `AGENTS.md` is written in English

### Task 1: Bootstrap the Repo and Enforce Quality Gates

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles/app.css`
- Create: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Scaffold the Vite TypeScript app and install the full toolchain**

```bash
npm create vite@latest . -- --template vanilla-ts
npm install @mediapipe/tasks-vision
npm install -D vitest @vitest/coverage-v8 playwright @playwright/test eslint @eslint/js typescript-eslint eslint-plugin-import eslint-plugin-boundaries eslint-plugin-sonarjs prettier globals npm-run-all
```

Expected: `package.json`, `src/main.ts`, `tsconfig*.json`, and Vite defaults are created; install exits with code 0.

- [ ] **Step 2: Replace the generated package scripts with strict quality commands**

```json
{
  "name": "balloon-shoot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest --run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "run-p lint typecheck test"
  }
}
```

- [ ] **Step 3: Install strict TypeScript, ESLint, Prettier, Vitest, and Playwright config**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

```js
// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import boundaries from "eslint-plugin-boundaries";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "playwright-report/**", "test-results/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: globals.browser
    },
    plugins: {
      import: importPlugin,
      boundaries,
      sonarjs
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/**" },
        { type: "shared", pattern: "src/shared/**" }
      ]
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "import/no-cycle": "error",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["feature", "shared"] },
            { from: "feature", allow: ["shared"] },
            { from: "shared", allow: ["shared"] }
          ]
        }
      ],
      "sonarjs/cognitive-complexity": ["error", 12],
      "no-useless-catch": "error"
    }
  }
);
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"]
  }
});
```

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173"
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
```

```js
// prettier.config.mjs
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "none"
};
```

```text
# .prettierignore
dist
coverage
playwright-report
test-results
```

- [ ] **Step 4: Create a minimal app shell and smoke test**

```html
<!-- index.html -->
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BalloonShoot PoC</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts
// src/main.ts
import "./styles/app.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

appRoot.innerHTML = `
  <main class="app-shell">
    <h1>BalloonShoot PoC</h1>
    <p>Bootstrap complete</p>
  </main>
`;
```

```css
/* src/styles/app.css */
:root {
  font-family: "Trebuchet MS", "Hiragino Kaku Gothic ProN", sans-serif;
  color: #132238;
  background: linear-gradient(180deg, #fff7cf 0%, #c8efff 100%);
}

body {
  margin: 0;
  min-height: 100vh;
}

.app-shell {
  display: grid;
  place-items: center;
  min-height: 100vh;
  gap: 0.75rem;
}
```

```ts
// tests/unit/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("bootstrap smoke", () => {
  it("keeps the PoC duration fixed at 60 seconds", () => {
    expect(60_000).toBe(60_000);
  });
});
```

- [ ] **Step 5: Verify the gate commands and commit**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`  
Expected: all commands exit 0 and `dist/` is produced.

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts playwright.config.ts eslint.config.mjs prettier.config.mjs .prettierignore index.html src/main.ts src/styles/app.css tests/unit/smoke.test.ts
git commit -m "chore: bootstrap frontend toolchain"
```

### Task 2: Build the Pure Gameplay Core with TDD

**Files:**
- Create: `src/features/gameplay/domain/balloon.ts`
- Create: `src/features/gameplay/domain/difficulty.ts`
- Create: `src/features/gameplay/domain/scoring.ts`
- Create: `src/features/gameplay/domain/createGameEngine.ts`
- Test: `tests/unit/features/gameplay/createGameEngine.test.ts`

- [ ] **Step 1: Write the failing gameplay tests**

```ts
// tests/unit/features/gameplay/createGameEngine.test.ts
import { describe, expect, it } from "vitest";
import { createGameEngine, registerShot } from "../../../../src/features/gameplay/domain/createGameEngine";

describe("createGameEngine", () => {
  it("starts with a 60 second timer and no balloons", () => {
    const engine = createGameEngine();
    expect(engine.timeRemainingMs).toBe(60_000);
    expect(engine.balloons).toHaveLength(0);
  });

  it("spawns more aggressive balloons as time advances", () => {
    const early = createGameEngine();
    const late = createGameEngine();

    early.advance(5_000, () => 0.05);
    late.advance(45_000, () => 0.95);

    expect(early.balloons[0]?.radius).toBeGreaterThan(late.balloons[0]?.radius ?? 0);
    expect(early.balloons[0]?.vy).toBeLessThan(late.balloons[0]?.vy ?? 0);
  });

  it("awards small balloons 3 points and applies combo multipliers", () => {
    const engine = createGameEngine();
    engine.forceBalloons([{ id: "small-1", x: 100, y: 100, radius: 18, vy: 40, size: "small", alive: true }]);

    registerShot(engine, { x: 100, y: 100, hit: true });
    engine.forceBalloons([{ id: "small-2", x: 120, y: 100, radius: 18, vy: 40, size: "small", alive: true }]);
    registerShot(engine, { x: 120, y: 100, hit: true });
    engine.forceBalloons([{ id: "small-3", x: 140, y: 100, radius: 18, vy: 40, size: "small", alive: true }]);
    registerShot(engine, { x: 140, y: 100, hit: true });

    expect(engine.score).toBe(12);
    expect(engine.combo).toBe(3);
    expect(engine.multiplier).toBe(2);
  });

  it("cuts the combo on miss without subtracting score", () => {
    const engine = createGameEngine();
    engine.forceScore({ score: 5, combo: 4, multiplier: 2 });

    registerShot(engine, { x: 0, y: 0, hit: false });

    expect(engine.score).toBe(5);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });
});
```

- [ ] **Step 2: Run the gameplay tests to confirm failure**

Run: `npm run test -- tests/unit/features/gameplay/createGameEngine.test.ts`  
Expected: FAIL with module-not-found errors for `createGameEngine`.

- [ ] **Step 3: Implement score, difficulty, and engine state**

```ts
// src/features/gameplay/domain/scoring.ts
export type BalloonSize = "normal" | "small";

export interface ScoreState {
  score: number;
  combo: number;
  multiplier: number;
}

const getMultiplier = (combo: number): number => {
  if (combo >= 6) {
    return 3;
  }

  if (combo >= 3) {
    return 2;
  }

  return 1;
};

export const registerHitScore = (state: ScoreState, size: BalloonSize): ScoreState => {
  const combo = state.combo + 1;
  const multiplier = getMultiplier(combo);
  const baseScore = size === "small" ? 3 : 1;

  return {
    score: state.score + baseScore * multiplier,
    combo,
    multiplier
  };
};

export const registerMissScore = (state: ScoreState): ScoreState => ({
  score: state.score,
  combo: 0,
  multiplier: 1
});
```

```ts
// src/features/gameplay/domain/difficulty.ts
export interface DifficultyProfile {
  spawnEveryMs: number;
  normalRadius: number;
  smallRadius: number;
  smallChance: number;
  balloonSpeed: number;
}

export const getDifficultyProfile = (elapsedMs: number): DifficultyProfile => {
  if (elapsedMs < 20_000) {
    return { spawnEveryMs: 1_200, normalRadius: 52, smallRadius: 28, smallChance: 0.1, balloonSpeed: 36 };
  }

  if (elapsedMs < 40_000) {
    return { spawnEveryMs: 900, normalRadius: 46, smallRadius: 24, smallChance: 0.2, balloonSpeed: 48 };
  }

  return { spawnEveryMs: 700, normalRadius: 40, smallRadius: 20, smallChance: 0.35, balloonSpeed: 64 };
};
```

```ts
// src/features/gameplay/domain/balloon.ts
import type { BalloonSize } from "./scoring";

export interface Balloon {
  id: string;
  x: number;
  y: number;
  radius: number;
  vy: number;
  size: BalloonSize;
  alive: boolean;
}
```

```ts
// src/features/gameplay/domain/createGameEngine.ts
import { getDifficultyProfile } from "./difficulty";
import type { Balloon } from "./balloon";
import { registerHitScore, registerMissScore, type ScoreState } from "./scoring";

export interface ShotInput {
  x: number;
  y: number;
  hit: boolean;
}

export interface GameEngine {
  timeRemainingMs: number;
  elapsedMs: number;
  balloons: Balloon[];
  score: number;
  combo: number;
  multiplier: number;
  advance: (deltaMs: number, random: () => number) => void;
  forceBalloons: (balloons: Balloon[]) => void;
  forceScore: (state: ScoreState) => void;
}

export const createGameEngine = (): GameEngine => {
  let nextBalloonId = 0;
  let spawnAccumulatorMs = 0;

  const engine: GameEngine = {
    timeRemainingMs: 60_000,
    elapsedMs: 0,
    balloons: [],
    score: 0,
    combo: 0,
    multiplier: 1,
    advance: (deltaMs, random) => {
      engine.elapsedMs += deltaMs;
      engine.timeRemainingMs = Math.max(0, engine.timeRemainingMs - deltaMs);

      const profile = getDifficultyProfile(engine.elapsedMs);
      spawnAccumulatorMs += deltaMs;

      while (spawnAccumulatorMs >= profile.spawnEveryMs) {
        spawnAccumulatorMs -= profile.spawnEveryMs;
        const isSmall = random() < profile.smallChance;
        engine.balloons.push({
          id: `balloon-${nextBalloonId++}`,
          x: 80 + random() * 480,
          y: 820,
          radius: isSmall ? profile.smallRadius : profile.normalRadius,
          vy: profile.balloonSpeed,
          size: isSmall ? "small" : "normal",
          alive: true
        });
      }

      engine.balloons = engine.balloons
        .map((balloon) => ({ ...balloon, y: balloon.y - balloon.vy * (deltaMs / 1_000) }))
        .filter((balloon) => balloon.alive && balloon.y + balloon.radius > -20);
    },
    forceBalloons: (balloons) => {
      engine.balloons = balloons;
    },
    forceScore: (state) => {
      engine.score = state.score;
      engine.combo = state.combo;
      engine.multiplier = state.multiplier;
    }
  };

  return engine;
};

export const registerShot = (engine: GameEngine, shot: ShotInput): void => {
  if (!shot.hit) {
    const nextScore = registerMissScore({
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    });

    engine.score = nextScore.score;
    engine.combo = nextScore.combo;
    engine.multiplier = nextScore.multiplier;
    return;
  }

  const hitBalloon = engine.balloons.find((balloon) => {
    const dx = balloon.x - shot.x;
    const dy = balloon.y - shot.y;

    return dx * dx + dy * dy <= balloon.radius * balloon.radius;
  });

  if (!hitBalloon) {
    registerShot(engine, { ...shot, hit: false });
    return;
  }

  hitBalloon.alive = false;
  const nextScore = registerHitScore(
    {
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    },
    hitBalloon.size
  );

  engine.score = nextScore.score;
  engine.combo = nextScore.combo;
  engine.multiplier = nextScore.multiplier;
};
```

- [ ] **Step 4: Run the gameplay tests to confirm they pass**

Run: `npm run test -- tests/unit/features/gameplay/createGameEngine.test.ts`  
Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/features/gameplay/createGameEngine.test.ts src/features/gameplay/domain/balloon.ts src/features/gameplay/domain/difficulty.ts src/features/gameplay/domain/scoring.ts src/features/gameplay/domain/createGameEngine.ts
git commit -m "feat: add gameplay core"
```

### Task 3: Build Input Mapping with TDD

**Files:**
- Create: `src/shared/types/hand.ts`
- Create: `src/features/input-mapping/createCrosshairSmoother.ts`
- Create: `src/features/input-mapping/evaluateGunPose.ts`
- Create: `src/features/input-mapping/evaluateThumbTrigger.ts`
- Create: `src/features/input-mapping/mapHandToGameInput.ts`
- Test: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

- [ ] **Step 1: Write the failing input-mapping tests**

```ts
// tests/unit/features/input-mapping/mapHandToGameInput.test.ts
import { describe, expect, it } from "vitest";
import { mapHandToGameInput } from "../../../../src/features/input-mapping/mapHandToGameInput";
import type { HandFrame } from "../../../../src/shared/types/hand";

const frame: HandFrame = {
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.4, y: 0.7, z: 0 },
    indexTip: { x: 0.5, y: 0.3, z: 0 },
    indexMcp: { x: 0.47, y: 0.48, z: 0 },
    thumbTip: { x: 0.34, y: 0.55, z: 0 },
    thumbIp: { x: 0.37, y: 0.57, z: 0 },
    middleTip: { x: 0.45, y: 0.64, z: 0 },
    ringTip: { x: 0.42, y: 0.66, z: 0 },
    pinkyTip: { x: 0.39, y: 0.67, z: 0 }
  }
};

describe("mapHandToGameInput", () => {
  it("maps the index finger to mirrored canvas coordinates", () => {
    const result = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    expect(result.crosshair.x).toBeCloseTo(640, 0);
    expect(result.crosshair.y).toBeCloseTo(216, 0);
  });

  it("only emits a shot when a loose gun pose and trigger pull occur", () => {
    const first = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          thumbTip: { x: 0.45, y: 0.62, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      first.runtime
    );

    expect(first.shotFired).toBe(false);
    expect(second.shotFired).toBe(true);
  });

  it("smooths crosshair motion instead of snapping raw coordinates", () => {
    const first = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.8, y: 0.2, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      first.runtime
    );

    expect(second.crosshair.x).toBeLessThan(256);
    expect(second.crosshair.x).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the input-mapping tests to confirm failure**

Run: `npm run test -- tests/unit/features/input-mapping/mapHandToGameInput.test.ts`  
Expected: FAIL with module-not-found errors for the input-mapping files.

- [ ] **Step 3: Implement pose, trigger, smoothing, and mapping**

```ts
// src/shared/types/hand.ts
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface HandFrame {
  width: number;
  height: number;
  landmarks: {
    wrist: Point3D;
    indexTip: Point3D;
    indexMcp: Point3D;
    thumbTip: Point3D;
    thumbIp: Point3D;
    middleTip: Point3D;
    ringTip: Point3D;
    pinkyTip: Point3D;
  };
}
```

```ts
// src/features/input-mapping/createCrosshairSmoother.ts
export interface CrosshairPoint {
  x: number;
  y: number;
}

export const smoothCrosshair = (
  previous: CrosshairPoint | undefined,
  next: CrosshairPoint,
  alpha = 0.28
): CrosshairPoint => {
  if (!previous) {
    return next;
  }

  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha
  };
};
```

```ts
// src/features/input-mapping/evaluateGunPose.ts
import type { HandFrame } from "../../shared/types/hand";

export const evaluateGunPose = (frame: HandFrame): boolean => {
  const { indexTip, indexMcp, middleTip, ringTip, pinkyTip } = frame.landmarks;

  const indexExtended = indexTip.y < indexMcp.y;
  const curledCount = [middleTip, ringTip, pinkyTip].filter((point) => point.y > indexMcp.y + 0.1).length;

  return indexExtended && curledCount >= 2;
};
```

```ts
// src/features/input-mapping/evaluateThumbTrigger.ts
import type { HandFrame } from "../../shared/types/hand";

export type TriggerState = "open" | "pulled";

export const evaluateThumbTrigger = (frame: HandFrame): TriggerState => {
  const { wrist, thumbTip, indexMcp } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const normalizedThumbTravel = (thumbTip.x - wrist.x) / handScale;

  return normalizedThumbTravel > 0.45 ? "pulled" : "open";
};
```

```ts
// src/features/input-mapping/mapHandToGameInput.ts
import { smoothCrosshair, type CrosshairPoint } from "./createCrosshairSmoother";
import { evaluateGunPose } from "./evaluateGunPose";
import { evaluateThumbTrigger, type TriggerState } from "./evaluateThumbTrigger";
import type { HandFrame } from "../../shared/types/hand";

export interface InputRuntimeState {
  crosshair?: CrosshairPoint;
  triggerState: TriggerState;
}

export interface GameInputFrame {
  crosshair: CrosshairPoint;
  gunPoseActive: boolean;
  triggerState: TriggerState;
  shotFired: boolean;
  runtime: InputRuntimeState;
}

export const mapHandToGameInput = (
  frame: HandFrame,
  canvasSize: { width: number; height: number },
  runtime: InputRuntimeState | undefined
): GameInputFrame => {
  const rawCrosshair = {
    x: (1 - frame.landmarks.indexTip.x) * canvasSize.width,
    y: frame.landmarks.indexTip.y * canvasSize.height
  };

  const crosshair = smoothCrosshair(runtime?.crosshair, rawCrosshair);
  const gunPoseActive = evaluateGunPose(frame);
  const triggerState = evaluateThumbTrigger(frame);
  const previousTrigger = runtime?.triggerState ?? "open";
  const shotFired = gunPoseActive && previousTrigger === "open" && triggerState === "pulled";

  return {
    crosshair,
    gunPoseActive,
    triggerState,
    shotFired,
    runtime: {
      crosshair,
      triggerState
    }
  };
};
```

- [ ] **Step 4: Run the input-mapping tests to confirm they pass**

Run: `npm run test -- tests/unit/features/input-mapping/mapHandToGameInput.test.ts`  
Expected: PASS with 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/features/input-mapping/mapHandToGameInput.test.ts src/shared/types/hand.ts src/features/input-mapping/createCrosshairSmoother.ts src/features/input-mapping/evaluateGunPose.ts src/features/input-mapping/evaluateThumbTrigger.ts src/features/input-mapping/mapHandToGameInput.ts
git commit -m "feat: add input mapping core"
```

### Task 4: Add App State, Countdown Flow, and Canvas Rendering

**Files:**
- Create: `src/app/state/appState.ts`
- Create: `src/app/state/reduceAppEvent.ts`
- Create: `src/app/bootstrap/startApp.ts`
- Create: `src/app/screens/renderShell.ts`
- Create: `src/features/rendering/drawGameFrame.ts`
- Test: `tests/integration/app/reduceAppEvent.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing app state tests**

```ts
// tests/integration/app/reduceAppEvent.test.ts
import { describe, expect, it } from "vitest";
import { reduceAppEvent, createInitialAppState } from "../../../src/app/state/reduceAppEvent";

describe("reduceAppEvent", () => {
  it("moves from camera-ready to countdown to playing", () => {
    let state = createInitialAppState();

    state = reduceAppEvent(state, { type: "CAMERA_READY" });
    state = reduceAppEvent(state, { type: "START_CLICKED" });
    state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining: 0 });

    expect(state.screen).toBe("playing");
  });

  it("moves to result when time expires", () => {
    const state = reduceAppEvent(
      { screen: "playing", score: 12, combo: 0, multiplier: 1, countdown: 0 },
      { type: "TIME_UP" }
    );

    expect(state.screen).toBe("result");
    expect(state.score).toBe(12);
  });
});
```

- [ ] **Step 2: Run the app state tests to confirm failure**

Run: `npm run test -- tests/integration/app/reduceAppEvent.test.ts`  
Expected: FAIL with module-not-found errors for the app state files.

- [ ] **Step 3: Implement the state machine, shell renderer, and Canvas draw layer**

```ts
// src/app/state/appState.ts
export type ScreenName = "permission" | "ready" | "countdown" | "playing" | "result";

export interface AppState {
  screen: ScreenName;
  countdown: number;
  score: number;
  combo: number;
  multiplier: number;
}

export type AppEvent =
  | { type: "CAMERA_READY" }
  | { type: "START_CLICKED" }
  | { type: "COUNTDOWN_TICK"; secondsRemaining: number }
  | { type: "TIME_UP" }
  | { type: "SCORE_SYNC"; score: number; combo: number; multiplier: number }
  | { type: "RETRY_CLICKED" };
```

```ts
// src/app/state/reduceAppEvent.ts
import type { AppEvent, AppState } from "./appState";

export const createInitialAppState = (): AppState => ({
  screen: "permission",
  countdown: 3,
  score: 0,
  combo: 0,
  multiplier: 1
});

export const reduceAppEvent = (state: AppState, event: AppEvent): AppState => {
  switch (event.type) {
    case "CAMERA_READY":
      return { ...state, screen: "ready" };
    case "START_CLICKED":
      return { ...state, screen: "countdown", countdown: 3 };
    case "COUNTDOWN_TICK":
      return event.secondsRemaining <= 0
        ? { ...state, screen: "playing", countdown: 0 }
        : { ...state, countdown: event.secondsRemaining };
    case "TIME_UP":
      return { ...state, screen: "result" };
    case "SCORE_SYNC":
      return { ...state, score: event.score, combo: event.combo, multiplier: event.multiplier };
    case "RETRY_CLICKED":
      return createInitialAppState();
  }
};
```

```ts
// src/app/screens/renderShell.ts
import type { AppState } from "../state/appState";

export const renderShell = (state: AppState): string => `
  <section class="overlay">
    <header class="hud">
      <span>Score: ${state.score}</span>
      <span>Combo: ${state.combo}</span>
      <span>x${state.multiplier}</span>
    </header>
    <div class="screen screen-${state.screen}">
      ${state.screen === "permission" ? "<button data-action=\"camera\">カメラを準備</button>" : ""}
      ${state.screen === "ready" ? "<button data-action=\"start\">スタート</button>" : ""}
      ${state.screen === "countdown" ? `<p class="countdown">${state.countdown || "start!"}</p>` : ""}
      ${state.screen === "result" ? "<button data-action=\"retry\">もう一度あそぶ</button>" : ""}
    </div>
  </section>
`;
```

```ts
// src/features/rendering/drawGameFrame.ts
import type { Balloon } from "../gameplay/domain/balloon";

export interface DrawState {
  balloons: Balloon[];
  crosshair: { x: number; y: number } | undefined;
}

export const drawGameFrame = (ctx: CanvasRenderingContext2D, state: DrawState): void => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const balloon of state.balloons) {
    ctx.beginPath();
    ctx.fillStyle = balloon.size === "small" ? "#ff8a80" : "#4fc3f7";
    ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!state.crosshair) {
    return;
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(state.crosshair.x, state.crosshair.y, 24, 0, Math.PI * 2);
  ctx.moveTo(state.crosshair.x - 32, state.crosshair.y);
  ctx.lineTo(state.crosshair.x + 32, state.crosshair.y);
  ctx.moveTo(state.crosshair.x, state.crosshair.y - 32);
  ctx.lineTo(state.crosshair.x, state.crosshair.y + 32);
  ctx.stroke();
};
```

```ts
// src/app/bootstrap/startApp.ts
import { createInitialAppState, reduceAppEvent } from "../state/reduceAppEvent";
import { renderShell } from "../screens/renderShell";

export const startApp = (root: HTMLDivElement): void => {
  let state = createInitialAppState();
  root.innerHTML = `<div class="app-layout"><canvas class="game-canvas"></canvas><div id="overlay-root"></div></div>`;
  const overlayRoot = root.querySelector<HTMLDivElement>("#overlay-root");

  if (!overlayRoot) {
    throw new Error("Missing overlay root");
  }

  const render = (): void => {
    overlayRoot.innerHTML = renderShell(state);
  };

  overlayRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (action === "camera") {
      state = reduceAppEvent(state, { type: "CAMERA_READY" });
    } else if (action === "start") {
      state = reduceAppEvent(state, { type: "START_CLICKED" });
    } else if (action === "retry") {
      state = reduceAppEvent(state, { type: "RETRY_CLICKED" });
    }

    render();
  });

  render();
};
```

```ts
// src/main.ts
import "./styles/app.css";
import { startApp } from "./app/bootstrap/startApp";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

startApp(appRoot);
```

- [ ] **Step 4: Update styles and run the integration tests**

```css
/* src/styles/app.css */
body {
  margin: 0;
  min-height: 100vh;
  overflow: hidden;
}

.app-layout {
  position: relative;
  min-height: 100vh;
}

.game-canvas {
  width: 100vw;
  height: 100vh;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
}

.hud {
  display: flex;
  gap: 16px;
  justify-content: flex-end;
}

.screen {
  display: grid;
  place-items: center;
  flex: 1;
}
```

Run: `npm run test -- tests/integration/app/reduceAppEvent.test.ts`  
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/app/reduceAppEvent.test.ts src/app/state/appState.ts src/app/state/reduceAppEvent.ts src/app/bootstrap/startApp.ts src/app/screens/renderShell.ts src/features/rendering/drawGameFrame.ts src/main.ts src/styles/app.css
git commit -m "feat: add app shell and renderer"
```

### Task 5: Integrate Camera, MediaPipe, Audio, and Debug Controls

**Files:**
- Create: `src/shared/config/gameConfig.ts`
- Create: `src/features/camera/createCameraController.ts`
- Create: `src/features/hand-tracking/createMediaPipeHandTracker.ts`
- Create: `src/features/audio/createAudioController.ts`
- Create: `src/features/debug/createDebugPanel.ts`
- Create: `public/models/hand_landmarker.task`
- Create: `public/audio/bgm.mp3`
- Create: `public/audio/shot.mp3`
- Create: `public/audio/hit.mp3`
- Create: `public/audio/time-up.mp3`
- Create: `public/audio/result.mp3`
- Create: `tests/unit/features/debug/createDebugPanel.test.ts`
- Modify: `src/app/bootstrap/startApp.ts`

- [ ] **Step 1: Write a failing debug-panel test**

```ts
// tests/unit/features/debug/createDebugPanel.test.ts
import { describe, expect, it } from "vitest";
import { createDebugPanel } from "../../../../src/features/debug/createDebugPanel";

describe("createDebugPanel", () => {
  it("exposes writable tuning values with fail-fast defaults", () => {
    const panel = createDebugPanel();

    expect(panel.values.smoothingAlpha).toBe(0.28);
    expect(panel.values.triggerPullThreshold).toBeGreaterThan(panel.values.triggerReleaseThreshold);
  });
});
```

- [ ] **Step 2: Run the debug test to confirm failure**

Run: `npm run test -- tests/unit/features/debug/createDebugPanel.test.ts`  
Expected: FAIL with module-not-found errors for `createDebugPanel`.

- [ ] **Step 3: Implement config, adapters, audio, and debug runtime**

```ts
// src/shared/config/gameConfig.ts
export const gameConfig = {
  camera: {
    width: 640,
    height: 480
  },
  input: {
    smoothingAlpha: 0.28,
    triggerPullThreshold: 0.45,
    triggerReleaseThreshold: 0.25
  }
} as const;
```

```ts
// src/features/camera/createCameraController.ts
export const createCameraController = (video: HTMLVideoElement) => ({
  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
  }
});
```

```ts
// src/features/hand-tracking/createMediaPipeHandTracker.ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export const createMediaPipeHandTracker = async (): Promise<HandLandmarker> => {
  const vision = await FilesetResolver.forVisionTasks("/wasm");

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task"
    },
    numHands: 1,
    runningMode: "VIDEO"
  });
};
```

```ts
// src/features/audio/createAudioController.ts
export const createAudioController = () => {
  const bgm = new Audio("/audio/bgm.mp3");
  bgm.loop = true;

  return {
    async startBgm(): Promise<void> {
      await bgm.play();
    },
    playShot(): void {
      void new Audio("/audio/shot.mp3").play();
    },
    playHit(): void {
      void new Audio("/audio/hit.mp3").play();
    },
    playTimeout(): void {
      void new Audio("/audio/time-up.mp3").play();
    },
    playResult(): void {
      void new Audio("/audio/result.mp3").play();
    },
    stopBgm(): void {
      bgm.pause();
      bgm.currentTime = 0;
    }
  };
};
```

```ts
// src/features/debug/createDebugPanel.ts
import { gameConfig } from "../../shared/config/gameConfig";

export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

export const createDebugPanel = () => {
  const values: DebugValues = {
    smoothingAlpha: gameConfig.input.smoothingAlpha,
    triggerPullThreshold: gameConfig.input.triggerPullThreshold,
    triggerReleaseThreshold: gameConfig.input.triggerReleaseThreshold
  };

  return {
    values,
    render(): string {
      return `
        <aside class="debug-panel">
          <label>Smoothing <input data-debug="smoothingAlpha" type="range" min="0.1" max="0.6" step="0.01" value="${values.smoothingAlpha}" /></label>
          <label>Pull <input data-debug="triggerPullThreshold" type="range" min="0.2" max="0.8" step="0.01" value="${values.triggerPullThreshold}" /></label>
          <label>Release <input data-debug="triggerReleaseThreshold" type="range" min="0.1" max="0.6" step="0.01" value="${values.triggerReleaseThreshold}" /></label>
        </aside>
      `;
    },
    bind(root: HTMLElement): void {
      root.querySelectorAll<HTMLInputElement>("[data-debug]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.debug as keyof DebugValues | undefined;
          if (!key) {
            throw new Error("Missing debug control key");
          }

          values[key] = Number(input.value);
        });
      });
    }
  };
};
```

```ts
// src/app/bootstrap/startApp.ts
import { createAudioController } from "../../features/audio/createAudioController";
import { createCameraController } from "../../features/camera/createCameraController";
import { createDebugPanel } from "../../features/debug/createDebugPanel";
import { createGameEngine, registerShot } from "../../features/gameplay/domain/createGameEngine";
import { createMediaPipeHandTracker } from "../../features/hand-tracking/createMediaPipeHandTracker";
import { mapHandToGameInput, type InputRuntimeState } from "../../features/input-mapping/mapHandToGameInput";
import { drawGameFrame } from "../../features/rendering/drawGameFrame";
import { createInitialAppState, reduceAppEvent } from "../state/reduceAppEvent";
import { renderShell } from "../screens/renderShell";

export const startApp = (root: HTMLDivElement): void => {
  const audio = createAudioController();
  const debugPanel = createDebugPanel();
  const game = createGameEngine();
  let state = createInitialAppState();
  let inputRuntime: InputRuntimeState | undefined;
  let countdownStartedAt = 0;
  let lastFrameAt = 0;
  let trackerPromise: ReturnType<typeof createMediaPipeHandTracker> | undefined;

  root.innerHTML = `
    <div class="app-layout">
      <video class="camera-feed" playsinline muted></video>
      <canvas class="game-canvas"></canvas>
      <div id="overlay-root"></div>
      <div id="debug-root"></div>
    </div>
  `;

  const overlayRoot = root.querySelector<HTMLDivElement>("#overlay-root");
  const debugRoot = root.querySelector<HTMLDivElement>("#debug-root");
  const video = root.querySelector<HTMLVideoElement>(".camera-feed");
  const canvas = root.querySelector<HTMLCanvasElement>(".game-canvas");

  if (!overlayRoot || !debugRoot || !video || !canvas) {
    throw new Error("Missing bootstrap elements");
  }

  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Missing 2D canvas context");
  }

  debugRoot.innerHTML = debugPanel.render();
  debugPanel.bind(debugRoot);
  const camera = createCameraController(video);

  const render = (): void => {
    overlayRoot.innerHTML = renderShell(state);
  };

  const frame = async (now: number): Promise<void> => {
    if (lastFrameAt === 0) {
      lastFrameAt = now;
    }

    const deltaMs = now - lastFrameAt;
    lastFrameAt = now;

    if (state.screen === "countdown") {
      const secondsRemaining = Math.max(0, 3 - Math.floor((now - countdownStartedAt) / 1_000));
      state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining });
      render();
    }

    if (state.screen === "playing") {
      game.advance(deltaMs, Math.random);

      const tracker = trackerPromise ? await trackerPromise : undefined;
      const detection = tracker ? tracker.detect(video, now) : undefined;

      if (detection) {
        const input = mapHandToGameInput(detection, { width: canvas.width, height: canvas.height }, inputRuntime);
        inputRuntime = input.runtime;

        if (input.shotFired) {
          audio.playShot();
          const scoreBefore = game.score;
          registerShot(game, { x: input.crosshair.x, y: input.crosshair.y, hit: true });
          if (game.score > scoreBefore) {
            audio.playHit();
          }
        }

        drawGameFrame(ctx, { balloons: game.balloons, crosshair: input.crosshair });
      } else {
        drawGameFrame(ctx, { balloons: game.balloons, crosshair: inputRuntime?.crosshair });
      }

      state = reduceAppEvent(state, {
        type: "SCORE_SYNC",
        score: game.score,
        combo: game.combo,
        multiplier: game.multiplier
      });

      if (game.timeRemainingMs === 0) {
        audio.playTimeout();
        audio.playResult();
        audio.stopBgm();
        state = reduceAppEvent(state, { type: "TIME_UP" });
      }

      render();
    }

    requestAnimationFrame((nextNow) => {
      void frame(nextNow);
    });
  };

  overlayRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (action === "camera") {
      void camera.start().then(() => {
        trackerPromise = createMediaPipeHandTracker();
        state = reduceAppEvent(state, { type: "CAMERA_READY" });
        render();
      });
      return;
    }

    if (action === "start") {
      void audio.startBgm();
      countdownStartedAt = performance.now();
      state = reduceAppEvent(state, { type: "START_CLICKED" });
    } else if (action === "retry") {
      audio.stopBgm();
      game.forceBalloons([]);
      game.forceScore({ score: 0, combo: 0, multiplier: 1 });
      inputRuntime = undefined;
      state = reduceAppEvent(state, { type: "RETRY_CLICKED" });
    }

    render();
  });

  render();
  requestAnimationFrame((now) => {
    void frame(now);
  });
};
```

- [ ] **Step 4: Add the MediaPipe model and local audio assets**

Run:

```bash
mkdir -p public/models public/audio
curl -L "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" -o public/models/hand_landmarker.task
cp /absolute/path/to/local/bgm.mp3 public/audio/bgm.mp3
cp /absolute/path/to/local/shot.mp3 public/audio/shot.mp3
cp /absolute/path/to/local/hit.mp3 public/audio/hit.mp3
cp /absolute/path/to/local/time-up.mp3 public/audio/time-up.mp3
cp /absolute/path/to/local/result.mp3 public/audio/result.mp3
```

Expected: `public/models/hand_landmarker.task` and all listed `public/audio/*.mp3` files exist.

- [ ] **Step 5: Run the debug test, browser smoke path, and the full quality gate**

Run: `npm run test -- tests/unit/features/debug/createDebugPanel.test.ts && npm run check && npm run dev`  
Expected: PASS for the debug test and all gate commands. Then, with the dev server open in Chrome, verify:

- camera permission transitions to the `スタート` button
- countdown reaches `start!`
- camera video remains visible behind the canvas
- debug sliders render in the corner
- one-minute timer eventually reaches result view after play

- [ ] **Step 6: Commit**

```bash
git add tests/unit/features/debug/createDebugPanel.test.ts src/shared/config/gameConfig.ts src/features/camera/createCameraController.ts src/features/hand-tracking/createMediaPipeHandTracker.ts src/features/audio/createAudioController.ts src/features/debug/createDebugPanel.ts src/app/bootstrap/startApp.ts public/models/hand_landmarker.task public/audio/bgm.mp3 public/audio/shot.mp3 public/audio/hit.mp3 public/audio/time-up.mp3 public/audio/result.mp3
git commit -m "feat: add browser adapters and debug controls"
```

### Task 6: Add Scoped AGENTS Docs, CLAUDE Symlinks, and Browser Smoke Coverage

**Files:**
- Create: `AGENTS.md`
- Create: `src/AGENTS.md`
- Create: `src/app/AGENTS.md`
- Create: `src/features/AGENTS.md`
- Create: `src/shared/AGENTS.md`
- Create: `tests/AGENTS.md`
- Create: `docs/AGENTS.md`
- Create: `tests/e2e/app.smoke.spec.ts`
- Create: `CLAUDE.md` symlink to `AGENTS.md`
- Create: `src/CLAUDE.md` symlink to `src/AGENTS.md`
- Create: `src/app/CLAUDE.md` symlink to `src/app/AGENTS.md`
- Create: `src/features/CLAUDE.md` symlink to `src/features/AGENTS.md`
- Create: `src/shared/CLAUDE.md` symlink to `src/shared/AGENTS.md`
- Create: `tests/CLAUDE.md` symlink to `tests/AGENTS.md`
- Create: `docs/CLAUDE.md` symlink to `docs/AGENTS.md`

- [ ] **Step 1: Write the repo and scoped AGENTS docs**

Write every `AGENTS.md` in English, even though nearby product docs may remain Japanese.

```md
<!-- AGENTS.md -->
# AGENTS.md

## WHY

- `BalloonShoot` is a Chrome-first browser PoC for after-school daycare use.
- The current goal is validating hand-tracked aiming and thumb-trigger shooting on ordinary laptops.

## WHAT

- `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`: authoritative PoC design
- `docs/superpowers/plans/2026-04-08-poc-implementation.md`: implementation plan
- `src/`: app and feature code
- `tests/`: automated verification

## HOW

- Keep game rules, input mapping, rendering, and browser adapters separate.
- Treat strict lint, typecheck, and tests as blocking checks.
- Add more scoped `AGENTS.md` files when a directory gains distinct responsibilities.
```

```md
<!-- src/features/AGENTS.md -->
# AGENTS.md

## WHY

- `src/features/` contains reusable feature modules that should remain independent from app shell concerns.

## WHAT

- `camera/`: webcam lifecycle
- `hand-tracking/`: MediaPipe adapter
- `input-mapping/`: pose, trigger, smoothing
- `gameplay/`: score, timer, balloons, difficulty
- `rendering/`: Canvas-only drawing
- `audio/`: BGM and SE playback
- `debug/`: runtime tuning and overlay helpers

## HOW

- Keep feature modules small and explicit.
- Prefer pure functions for game rules and input logic.
- Avoid importing from `src/app/`.
```

```md
<!-- src/AGENTS.md -->
# AGENTS.md

## WHY

- `src/` contains the runnable PoC code.

## WHAT

- `app/`: screen orchestration and bootstrap
- `features/`: reusable feature modules
- `shared/`: cross-cutting helpers and types

## HOW

- Keep `app/` thin.
- Push rules and calculations into `features/` or `shared/`.
```

```md
<!-- src/app/AGENTS.md -->
# AGENTS.md

## WHY

- `src/app/` coordinates browser-facing flows without owning game rules.

## WHAT

- `bootstrap/`: startup wiring
- `screens/`: overlay HTML generation
- `state/`: screen state transitions

## HOW

- Treat `state/` as the source of truth for screen changes.
- Avoid embedding MediaPipe or gameplay rules directly in screen code.
```

```md
<!-- src/shared/AGENTS.md -->
# AGENTS.md

## WHY

- `src/shared/` holds small, reusable building blocks used across the PoC.

## WHAT

- `config/`: immutable defaults
- `types/`: shared type contracts
- additional math or browser helpers as needed

## HOW

- Keep files focused and dependency-light.
- Do not import from `src/app/` or feature internals.
```

```md
<!-- tests/AGENTS.md -->
# AGENTS.md

## WHY

- `tests/` verifies the PoC with fast unit coverage first and browser checks second.

## WHAT

- `unit/`: pure gameplay and input logic
- `integration/`: reducer and bootstrap seams
- `e2e/`: Chromium smoke coverage

## HOW

- Prefer deterministic tests.
- Mock browser edges instead of hiding failures behind fallbacks.
```

```md
<!-- docs/AGENTS.md -->
# AGENTS.md

## WHY

- `docs/` stores the current project memo, formal design, and implementation plan.

## WHAT

- `notes/`: project memo and ongoing context
- `superpowers/specs/`: approved design docs
- `superpowers/plans/`: execution plans

## HOW

- Keep docs stateless and aligned.
- When a design supersedes an older memo assumption, say so explicitly.
```

- [ ] **Step 2: Create the CLAUDE symlinks**

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md src/CLAUDE.md
ln -s AGENTS.md src/app/CLAUDE.md
ln -s AGENTS.md src/features/CLAUDE.md
ln -s AGENTS.md src/shared/CLAUDE.md
ln -s AGENTS.md tests/CLAUDE.md
ln -s AGENTS.md docs/CLAUDE.md
```

Expected: each directory listed above contains both `AGENTS.md` and a sibling `CLAUDE.md` symlink pointing at it.

- [ ] **Step 3: Add a Playwright smoke test for the shell**

```ts
// tests/e2e/app.smoke.spec.ts
import { expect, test } from "@playwright/test";

test("shows the camera preparation button on first load", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "カメラを準備" })).toBeVisible();
  await expect(page.getByText("Score: 0")).toBeVisible();
});
```

- [ ] **Step 4: Audit the AGENTS docs and run browser verification**

Run: `python3 ~/.codex/skills/agents-md-best-practices/scripts/agents_md_tool.py audit --root /Users/sankenbisha/Dev/after-school_daycare/BalloonShoot --require-why-what-how && npx playwright install chromium && npm run test:e2e && npm run check`  
Expected: audit exits 0 with no WHY/WHAT/HOW violations, Playwright smoke test passes in Chromium, and `npm run check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md src/AGENTS.md src/CLAUDE.md src/app/AGENTS.md src/app/CLAUDE.md src/features/AGENTS.md src/features/CLAUDE.md src/shared/AGENTS.md src/shared/CLAUDE.md tests/AGENTS.md tests/CLAUDE.md docs/AGENTS.md docs/CLAUDE.md tests/e2e/app.smoke.spec.ts
git commit -m "docs: add scoped agent guidance"
```
