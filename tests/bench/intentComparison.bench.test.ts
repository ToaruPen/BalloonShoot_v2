import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOneEuroFilter } from "../../src/features/hand-tracking/oneEuroFilter";
import { buildHandEvidence } from "../../src/features/input-mapping/createHandEvidence";
import { measureThumbCosine, type TriggerState } from "../../src/features/input-mapping/evaluateThumbTrigger";
import { mapHandToGameInput, type GameInputFrame, type InputRuntimeState } from "../../src/features/input-mapping/mapHandToGameInput";
import { gameConfig } from "../../src/shared/config/gameConfig";
import type { HandDetection, HandFrame, HandLandmarkSet, Point3D } from "../../src/shared/types/hand";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixturesDir = join(repoRoot, "tests", "fixtures", "videos");

interface FixtureFrame {
  tMs: number;
  frame: HandFrame | null;
}

interface Fixture {
  source: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  frames: FixtureFrame[];
}

const FIXTURE_LABELS = ["right-hand", "left-hand"] as const;

const loadFixture = (name: (typeof FIXTURE_LABELS)[number]): Fixture | undefined => {
  const path = join(fixturesDir, `${name}.landmarks.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as Fixture;
};

type TrackedName =
  | "wrist"
  | "thumbIp"
  | "thumbTip"
  | "indexMcp"
  | "indexTip"
  | "middleTip"
  | "ringTip"
  | "pinkyTip";

const TRACKED_NAMES: TrackedName[] = [
  "wrist",
  "thumbIp",
  "thumbTip",
  "indexMcp",
  "indexTip",
  "middleTip",
  "ringTip",
  "pinkyTip"
];

interface FilterTriad {
  x: ReturnType<typeof createOneEuroFilter>;
  y: ReturnType<typeof createOneEuroFilter>;
  z: ReturnType<typeof createOneEuroFilter>;
}

type LandmarkFilters = Record<TrackedName, FilterTriad>;

interface LandmarkFiltersBySpace {
  image: LandmarkFilters;
  world: LandmarkFilters;
}

const createLandmarkFilters = (
  getConfig: () => { minCutoff: number; beta: number; dCutoff: number }
): LandmarkFilters => {
  const filters = {} as LandmarkFilters;
  for (const name of TRACKED_NAMES) {
    filters[name] = {
      x: createOneEuroFilter(getConfig),
      y: createOneEuroFilter(getConfig),
      z: createOneEuroFilter(getConfig)
    };
  }
  return filters;
};

const createFiltersBySpace = (
  getConfig: () => { minCutoff: number; beta: number; dCutoff: number }
): LandmarkFiltersBySpace => ({
  image: createLandmarkFilters(getConfig),
  world: createLandmarkFilters(getConfig)
});

const resetFilters = (filters: LandmarkFilters): void => {
  for (const name of TRACKED_NAMES) {
    filters[name].x.reset();
    filters[name].y.reset();
    filters[name].z.reset();
  }
};

const resetFiltersBySpace = (filters: LandmarkFiltersBySpace): void => {
  resetFilters(filters.image);
  resetFilters(filters.world);
};

const filterPoint = (point: Point3D, triad: FilterTriad, tMs: number): Point3D => ({
  x: triad.x.filter(point.x, tMs),
  y: triad.y.filter(point.y, tMs),
  z: triad.z.filter(point.z, tMs)
});

const filterLandmarkSet = (
  landmarks: HandLandmarkSet,
  filters: LandmarkFilters,
  tMs: number
): HandLandmarkSet => ({
  wrist: filterPoint(landmarks.wrist, filters.wrist, tMs),
  thumbIp: filterPoint(landmarks.thumbIp, filters.thumbIp, tMs),
  thumbTip: filterPoint(landmarks.thumbTip, filters.thumbTip, tMs),
  indexMcp: filterPoint(landmarks.indexMcp, filters.indexMcp, tMs),
  indexTip: filterPoint(landmarks.indexTip, filters.indexTip, tMs),
  middleTip: filterPoint(landmarks.middleTip, filters.middleTip, tMs),
  ringTip: filterPoint(landmarks.ringTip, filters.ringTip, tMs),
  pinkyTip: filterPoint(landmarks.pinkyTip, filters.pinkyTip, tMs)
});

const filterHandFrame = (
  raw: HandFrame,
  filters: LandmarkFiltersBySpace,
  tMs: number
): HandFrame => ({
  ...raw,
  landmarks: filterLandmarkSet(raw.landmarks, filters.image, tMs),
  ...(raw.worldLandmarks
    ? {
        worldLandmarks: filterLandmarkSet(raw.worldLandmarks, filters.world, tMs)
      }
    : {})
});

interface PullSegment {
  startFrame: number;
  endFrame: number;
  frameCount: number;
  shotCount: number;
}

interface StrategyMetrics {
  strategy: string;
  fixture: string;
  totalFrames: number;
  detectedFrames: number;
  totalShots: number;
  totalPullSegments: number;
  singleFrameSegments: number;
  hitPullSegments: number;
  missedPullSegments: number;
  multiShotSegments: number;
  shotsOutsideSegments: number;
}

interface SimpleStrategyRuntime {
  crosshair: GameInputFrame["crosshair"] | undefined;
  rawTriggerState: TriggerState;
  triggerState: TriggerState;
  pulledFrames: number;
  openFrames: number;
  hasSeenStableOpen: boolean;
  trackingPresentFrames: number;
  trackingLostFrames: number;
}

interface StrategyContext {
  detection: HandDetection | undefined;
  viewport: { width: number; height: number };
}

interface StrategyDefinition<Runtime> {
  name: string;
  createRuntime(): Runtime;
  step(context: StrategyContext, runtime: Runtime): { runtime: Runtime; shotFired: boolean };
}

const createInitialSimpleRuntime = (): SimpleStrategyRuntime => ({
  crosshair: undefined,
  rawTriggerState: "open",
  triggerState: "open",
  pulledFrames: 0,
  openFrames: 0,
  hasSeenStableOpen: false,
  trackingPresentFrames: 0,
  trackingLostFrames: 0
});

const TRIGGER_CONFIRMATION_FRAMES = 2;
const TRIGGER_RELEASE_FRAMES = 2;
const TRACKING_RECOVERY_FRAMES = 2;
const TRACKING_LOSS_GRACE_FRAMES = 3;

const resolveTrackingLossRuntime = (
  runtime: SimpleStrategyRuntime
): { runtime: SimpleStrategyRuntime; shotFired: boolean } => {
  const trackingLostFrames = runtime.trackingLostFrames + 1;
  return {
    shotFired: false,
    runtime: {
      ...runtime,
      crosshair: undefined,
      rawTriggerState: "open",
      triggerState: "open",
      pulledFrames: 0,
      openFrames: 0,
      trackingPresentFrames: 0,
      trackingLostFrames,
      hasSeenStableOpen:
        trackingLostFrames > TRACKING_LOSS_GRACE_FRAMES ? false : runtime.hasSeenStableOpen
    }
  };
};

const resolveDebouncedTrigger = (
  runtime: SimpleStrategyRuntime,
  rawTriggerState: TriggerState
): Pick<SimpleStrategyRuntime, "rawTriggerState" | "triggerState" | "pulledFrames" | "openFrames"> => {
  const pulledFrames = rawTriggerState === "pulled" ? runtime.pulledFrames + 1 : 0;
  const openFrames = rawTriggerState === "open" ? runtime.openFrames + 1 : 0;
  let triggerState = runtime.triggerState;

  if (
    runtime.triggerState === "open" &&
    rawTriggerState === "pulled" &&
    pulledFrames >= TRIGGER_CONFIRMATION_FRAMES
  ) {
    triggerState = "pulled";
  } else if (
    runtime.triggerState === "pulled" &&
    rawTriggerState === "open" &&
    openFrames >= TRIGGER_RELEASE_FRAMES
  ) {
    triggerState = "open";
  }

  return {
    rawTriggerState,
    triggerState,
    pulledFrames,
    openFrames
  };
};

const stepSimpleStrategy = (
  context: StrategyContext,
  runtime: SimpleStrategyRuntime,
  gateIntent: (evidence: ReturnType<typeof buildHandEvidence>) => boolean
): { runtime: SimpleStrategyRuntime; shotFired: boolean } => {
  const evidence = buildHandEvidence(
    context.detection,
    context.viewport,
    {
      crosshair: runtime.crosshair,
      rawTriggerState: runtime.rawTriggerState
    },
    undefined,
    gameConfig.input
  );

  if (!evidence.trackingPresent) {
    return resolveTrackingLossRuntime(runtime);
  }

  const trackingPresentFrames = runtime.trackingPresentFrames + 1;
  const rawTriggerState = evidence.trigger?.rawState ?? runtime.rawTriggerState;
  const trigger = resolveDebouncedTrigger(runtime, rawTriggerState);

  const gateOpen = trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gateIntent(evidence);
  const hasSeenStableOpen =
    rawTriggerState === "open" && trigger.openFrames >= TRIGGER_RELEASE_FRAMES && gateOpen
      ? true
      : runtime.hasSeenStableOpen;
  const shotFired =
    gateOpen &&
    hasSeenStableOpen &&
    runtime.triggerState === "open" &&
    trigger.triggerState === "pulled";

  return {
    shotFired,
    runtime: {
      crosshair: evidence.smoothedCrosshairCandidate ?? undefined,
      ...trigger,
      hasSeenStableOpen,
      trackingPresentFrames,
      trackingLostFrames: 0
    }
  };
};

const strategyDefinitions: StrategyDefinition<InputRuntimeState | undefined | SimpleStrategyRuntime>[] = [
  {
  name: "conditioned_trigger_thin_fsm",
    createRuntime: () => undefined,
    step: (context, runtime) => {
      const output = mapHandToGameInput(context.detection, context.viewport, runtime as InputRuntimeState | undefined);
      return { runtime: output.runtime, shotFired: output.shotFired };
    }
  },
  {
    name: "thumb_only",
    createRuntime: createInitialSimpleRuntime,
    step: (context, runtime) =>
      stepSimpleStrategy(context, runtime as SimpleStrategyRuntime, () => true)
  },
  {
    name: "thumb_plus_strict_gun_pose",
    createRuntime: createInitialSimpleRuntime,
    step: (context, runtime) =>
      stepSimpleStrategy(
        context,
        runtime as SimpleStrategyRuntime,
        (evidence) => evidence.gunPose?.detected ?? false
      )
  }
];

const createDetection = (
  frame: HandFrame | null,
  filters: LandmarkFiltersBySpace,
  tMs: number
): HandDetection | undefined => {
  if (!frame) {
    resetFiltersBySpace(filters);
    return undefined;
  }

  const filtered = filterHandFrame(frame, filters, tMs);
  return { rawFrame: frame, filteredFrame: filtered };
};

const startSegment = (frameIndex: number): PullSegment => ({
  startFrame: frameIndex,
  endFrame: frameIndex,
  frameCount: 1,
  shotCount: 0
});

const finalizeSegment = (
  completed: PullSegment[],
  active: PullSegment | null
): PullSegment | null => {
  if (!active) return null;
  completed.push(active);
  return null;
};

const advanceSegments = (
  activeSegment: PullSegment | null,
  segments: PullSegment[],
  detection: HandDetection | undefined,
  frameIndex: number,
  pullThreshold: number
): PullSegment | null => {
  if (!detection) {
    return finalizeSegment(segments, activeSegment);
  }

  const rawCos = measureThumbCosine(detection.rawFrame);
  if (rawCos <= pullThreshold) {
    return finalizeSegment(segments, activeSegment);
  }

  const nextSegment: PullSegment = activeSegment ?? startSegment(frameIndex);
  nextSegment.endFrame = frameIndex;
  if (activeSegment) nextSegment.frameCount += 1;
  return nextSegment;
};

const recordShot = (
  activeSegment: PullSegment | null,
  summary: { totalShots: number; shotsOutsideSegments: number }
): { totalShots: number; shotsOutsideSegments: number } => {
  if (activeSegment) {
    activeSegment.shotCount += 1;
    return {
      totalShots: summary.totalShots + 1,
      shotsOutsideSegments: summary.shotsOutsideSegments
    };
  }

  return {
    totalShots: summary.totalShots + 1,
    shotsOutsideSegments: summary.shotsOutsideSegments + 1
  };
};

const runStrategy = (
  fixtureLabel: string,
  fixture: Fixture,
  strategy: StrategyDefinition<InputRuntimeState | undefined | SimpleStrategyRuntime>
): StrategyMetrics => {
  const filterConfig = () => ({
    minCutoff: gameConfig.input.handFilterMinCutoff,
    beta: gameConfig.input.handFilterBeta,
    dCutoff: gameConfig.input.handFilterDCutoff
  });
  const filters = createFiltersBySpace(filterConfig);
  const viewport = { width: 1280, height: 720 };
  const pullThreshold = gameConfig.input.triggerPullThreshold;
  let runtime = strategy.createRuntime();
  let detectedFrames = 0;
  let totalShots = 0;
  let shotsOutsideSegments = 0;
  const segments: PullSegment[] = [];
  let activeSegment: PullSegment | null = null;

  for (const [frameIndex, frameEntry] of fixture.frames.entries()) {
    const detection = createDetection(frameEntry.frame, filters, frameEntry.tMs);
    if (detection) detectedFrames += 1;
    activeSegment = advanceSegments(activeSegment, segments, detection, frameIndex, pullThreshold);

    const result = strategy.step({ detection, viewport }, runtime);
    runtime = result.runtime;

    if (!result.shotFired) continue;
    ({ totalShots, shotsOutsideSegments } = recordShot(activeSegment, {
      totalShots,
      shotsOutsideSegments
    }));
  }

  activeSegment = finalizeSegment(segments, activeSegment);
  const meaningfulSegments = segments.filter(
    (segment) => segment.frameCount >= TRIGGER_CONFIRMATION_FRAMES
  );
  const hitPullSegments = meaningfulSegments.filter((segment) => segment.shotCount >= 1).length;
  const multiShotSegments = meaningfulSegments.filter((segment) => segment.shotCount > 1).length;
  const singleFrameSegments = segments.filter((segment) => segment.frameCount === 1).length;

  return {
    strategy: strategy.name,
    fixture: fixtureLabel,
    totalFrames: fixture.frames.length,
    detectedFrames,
    totalShots,
    totalPullSegments: meaningfulSegments.length,
    singleFrameSegments,
    hitPullSegments,
    missedPullSegments: meaningfulSegments.length - hitPullSegments,
    multiShotSegments,
    shotsOutsideSegments
  };
};

const rankMetrics = (metrics: StrategyMetrics[]): StrategyMetrics[] =>
  [...metrics].sort((left, right) => {
    if (left.missedPullSegments !== right.missedPullSegments) {
      return left.missedPullSegments - right.missedPullSegments;
    }
    if (left.multiShotSegments !== right.multiShotSegments) {
      return left.multiShotSegments - right.multiShotSegments;
    }
    if (left.shotsOutsideSegments !== right.shotsOutsideSegments) {
      return left.shotsOutsideSegments - right.shotsOutsideSegments;
    }
    return right.hitPullSegments - left.hitPullSegments;
  });

const aggregateMetrics = (metrics: StrategyMetrics[]): StrategyMetrics[] => {
  const summary = new Map<string, StrategyMetrics>();

  for (const metric of metrics) {
    const existing = summary.get(metric.strategy);
    if (existing) {
      existing.totalFrames += metric.totalFrames;
      existing.detectedFrames += metric.detectedFrames;
      existing.totalShots += metric.totalShots;
      existing.totalPullSegments += metric.totalPullSegments;
      existing.singleFrameSegments += metric.singleFrameSegments;
      existing.hitPullSegments += metric.hitPullSegments;
      existing.missedPullSegments += metric.missedPullSegments;
      existing.multiShotSegments += metric.multiShotSegments;
      existing.shotsOutsideSegments += metric.shotsOutsideSegments;
      continue;
    }

    summary.set(metric.strategy, {
      ...metric,
      fixture: "aggregate"
    });
  }

  return rankMetrics([...summary.values()]);
};

describe("intent strategy comparison replay", () => {
  it("compares available intent gates against the recorded fixtures", () => {
    const fixtures = FIXTURE_LABELS.map((label) => ({ label, fixture: loadFixture(label) }));
    for (const { fixture, label } of fixtures) {
      expect(fixture, `Missing replay fixture: ${label}`).toBeDefined();
    }

    const metrics: StrategyMetrics[] = [];
    for (const { label, fixture } of fixtures) {
      if (!fixture) continue;
      for (const strategy of strategyDefinitions) {
        metrics.push(runStrategy(label, fixture, strategy));
      }
    }

    for (const label of FIXTURE_LABELS) {
      const perFixture = rankMetrics(metrics.filter((metric) => metric.fixture === label));
      console.log(`\n=== intent comparison: ${label} ===`);
      console.table(
        perFixture.map((metric) => ({
          strategy: metric.strategy,
          shots: metric.totalShots,
          pullSegments: metric.totalPullSegments,
          singleFrameSegments: metric.singleFrameSegments,
          hitSegments: metric.hitPullSegments,
          missedSegments: metric.missedPullSegments,
          multiShotSegments: metric.multiShotSegments,
          shotsOutsideSegments: metric.shotsOutsideSegments
        }))
      );
    }

    const aggregate = aggregateMetrics(metrics);
    console.log("\n=== intent comparison: aggregate ranking ===");
    console.table(
      aggregate.map((metric) => ({
        strategy: metric.strategy,
        shots: metric.totalShots,
        pullSegments: metric.totalPullSegments,
        singleFrameSegments: metric.singleFrameSegments,
        hitSegments: metric.hitPullSegments,
        missedSegments: metric.missedPullSegments,
        multiShotSegments: metric.multiShotSegments,
        shotsOutsideSegments: metric.shotsOutsideSegments
      }))
    );

    expect(aggregate[0]?.totalPullSegments ?? 0).toBeGreaterThan(0);
  });
});
