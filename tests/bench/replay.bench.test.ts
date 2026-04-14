import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOneEuroFilter } from "../../src/features/hand-tracking/oneEuroFilter";
import { mapHandToGameInput } from "../../src/features/input-mapping/mapHandToGameInput";
import { measureThumbCosine } from "../../src/features/input-mapping/evaluateThumbTrigger";
import { gameConfig } from "../../src/shared/config/gameConfig";
import type {
  HandDetection,
  HandFrame,
  HandLandmarkSet,
  Point3D
} from "../../src/shared/types/hand";

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

const MIN_FIRES_BY_FIXTURE = {
  "right-hand": 10,
  "left-hand": 10
} as const;

const FIXTURE_LABELS = ["right-hand", "left-hand"] as const;

const loadFixture = (name: string): Fixture | undefined => {
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

const filterPoint = (
  point: Point3D,
  triad: FilterTriad,
  tMs: number
): Point3D => ({
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
  length: number;
  rawPeak: number;
  phaseAtPeak: string;
  fired: boolean;
  gunPoseConfidenceAtPeak: number;
  gunPoseActiveAtPeak: boolean;
  openFramesAtPeak: number;
  nonGunPoseFramesAtPeak: number;
  hasSeenStableOpenAtPeak: boolean;
}

interface ReplayMetrics {
  total: number;
  detected: number;
  trackingLostFrames: number;
  armedFrames: number;
  fired: number;
  phaseCounts: Record<string, number>;
  rawCosine: {
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  armedRawCosine: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };
  pullSegments: PullSegment[];
  singleFrameSpikes: number;
  firedFrameIndices: number[];
  nearMissBuckets: Record<string, number>;
}

type NearMissBucket =
  | ">-0.05"
  | "-0.10..-0.05"
  | "-0.15..-0.10"
  | "-0.20..-0.15"
  | "-0.25..-0.20"
  | "-0.30..-0.25"
  | "-0.35..-0.30";

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? NaN;
};

const incrementBucket = (
  buckets: Record<string, number>,
  key: NearMissBucket
): void => {
  buckets[key] = (buckets[key] ?? 0) + 1;
};

const updateNearMissBuckets = (metrics: ReplayMetrics, rawCos: number): void => {
  if (rawCos > -0.05) incrementBucket(metrics.nearMissBuckets, ">-0.05");
  else if (rawCos > -0.10) incrementBucket(metrics.nearMissBuckets, "-0.10..-0.05");
  else if (rawCos > -0.15) incrementBucket(metrics.nearMissBuckets, "-0.15..-0.10");
  else if (rawCos > -0.20) incrementBucket(metrics.nearMissBuckets, "-0.20..-0.15");
  else if (rawCos > -0.25) incrementBucket(metrics.nearMissBuckets, "-0.25..-0.20");
  else if (rawCos > -0.30) incrementBucket(metrics.nearMissBuckets, "-0.30..-0.25");
  else if (rawCos > -0.35) incrementBucket(metrics.nearMissBuckets, "-0.35..-0.30");
};

const createPullSegment = (
  index: number,
  rawCos: number,
  phase: string,
  runtime: ReturnType<typeof mapHandToGameInput>["runtime"]
): PullSegment => ({
  startFrame: index,
  endFrame: index,
  length: 0,
  rawPeak: rawCos,
  phaseAtPeak: phase,
  fired: false,
  gunPoseConfidenceAtPeak: runtime.gunPoseConfidence,
  gunPoseActiveAtPeak: runtime.gunPoseActive,
  openFramesAtPeak: runtime.openFrames,
  nonGunPoseFramesAtPeak: runtime.nonGunPoseFrames,
  hasSeenStableOpenAtPeak: runtime.hasSeenStableOpen
});

const finalizeCurrentSegment = (
  metrics: ReplayMetrics,
  currentSegment: PullSegment | null
): PullSegment | null => {
  if (!currentSegment) return null;
  if (currentSegment.length === 1) metrics.singleFrameSpikes += 1;
  metrics.pullSegments.push(currentSegment);
  return null;
};

const recordSegmentFrame = (
  currentSegment: PullSegment | null,
  index: number,
  rawCos: number,
  phase: string,
  runtime: ReturnType<typeof mapHandToGameInput>["runtime"],
  shotFired: boolean
): PullSegment => {
  const segment = currentSegment ?? createPullSegment(index, rawCos, phase, runtime);
  segment.endFrame = index;
  segment.length += 1;

  if (rawCos > segment.rawPeak) {
    segment.rawPeak = rawCos;
    segment.phaseAtPeak = phase;
    segment.gunPoseConfidenceAtPeak = runtime.gunPoseConfidence;
    segment.gunPoseActiveAtPeak = runtime.gunPoseActive;
    segment.openFramesAtPeak = runtime.openFrames;
    segment.nonGunPoseFramesAtPeak = runtime.nonGunPoseFrames;
    segment.hasSeenStableOpenAtPeak = runtime.hasSeenStableOpen;
  }

  if (shotFired) segment.fired = true;

  return segment;
};

const formatFixed = (value: number, digits: number): string => value.toFixed(digits);

interface ReplayAccumulatorContext {
  metrics: ReplayMetrics;
  viewport: { width: number; height: number };
  filters: LandmarkFiltersBySpace;
  runtime: ReturnType<typeof mapHandToGameInput>["runtime"] | undefined;
  currentSegment: PullSegment | null;
  allRawCosines: number[];
  armedRawCosines: number[];
  pullThreshold: number;
}

const processReplayFrame = (
  context: ReplayAccumulatorContext,
  frameEntry: FixtureFrame,
  frameIndex: number
): void => {
  const { metrics, viewport, filters, allRawCosines, armedRawCosines, pullThreshold } = context;
  const { tMs, frame } = frameEntry;

  let detection: HandDetection | undefined;
  if (frame) {
    metrics.detected += 1;
    const filtered = filterHandFrame(frame, filters, tMs);
    detection = { rawFrame: frame, filteredFrame: filtered };
  } else {
    resetFiltersBySpace(filters);
  }

  const output = mapHandToGameInput(detection, viewport, context.runtime);
  context.runtime = output.runtime;

  const phase = output.runtime.phase;
  metrics.phaseCounts[phase] = (metrics.phaseCounts[phase] ?? 0) + 1;
  if (phase === "tracking_lost") metrics.trackingLostFrames += 1;
  if (phase === "armed") metrics.armedFrames += 1;
  if (output.shotFired) {
    metrics.fired += 1;
    metrics.firedFrameIndices.push(frameIndex);
  }

  if (!frame) return;

  const rawCos = measureThumbCosine(frame);
  allRawCosines.push(rawCos);
  if (phase === "armed") armedRawCosines.push(rawCos);
  if (rawCos > metrics.rawCosine.max) metrics.rawCosine.max = rawCos;
  if (rawCos < metrics.rawCosine.min) metrics.rawCosine.min = rawCos;

  updateNearMissBuckets(metrics, rawCos);

  if (rawCos > pullThreshold) {
    context.currentSegment = recordSegmentFrame(
      context.currentSegment,
      frameIndex,
      rawCos,
      phase,
      output.runtime,
      output.shotFired
    );
    return;
  }

  context.currentSegment = finalizeCurrentSegment(metrics, context.currentSegment);
};

const replay = (fixture: Fixture, label: string): ReplayMetrics => {
  const filterConfig = () => ({
    minCutoff: gameConfig.input.handFilterMinCutoff,
    beta: gameConfig.input.handFilterBeta,
    dCutoff: gameConfig.input.handFilterDCutoff
  });
  const filters = createFiltersBySpace(filterConfig);
  const viewport = { width: 1280, height: 720 };
  const metrics: ReplayMetrics = {
    total: fixture.frames.length,
    detected: 0,
    trackingLostFrames: 0,
    armedFrames: 0,
    fired: 0,
    phaseCounts: {},
    rawCosine: { min: Infinity, max: -Infinity, p50: 0, p90: 0, p95: 0, p99: 0 },
    armedRawCosine: { p50: 0, p90: 0, p95: 0, p99: 0, max: 0 },
    pullSegments: [],
    singleFrameSpikes: 0,
    firedFrameIndices: [],
    nearMissBuckets: {
      ">-0.05": 0,
      "-0.10..-0.05": 0,
      "-0.15..-0.10": 0,
      "-0.20..-0.15": 0,
      "-0.25..-0.20": 0,
      "-0.30..-0.25": 0,
      "-0.35..-0.30": 0
    }
  };

  const allRawCosines: number[] = [];
  const armedRawCosines: number[] = [];
  const context: ReplayAccumulatorContext = {
    metrics,
    viewport,
    filters,
    runtime: undefined,
    currentSegment: null,
    allRawCosines,
    armedRawCosines,
    pullThreshold: gameConfig.input.triggerPullThreshold
  };

  for (const [i, frameEntry] of fixture.frames.entries()) {
    processReplayFrame(context, frameEntry, i);
  }

  context.currentSegment = finalizeCurrentSegment(metrics, context.currentSegment);

  const sortedAll = [...allRawCosines].sort((a, b) => a - b);
  metrics.rawCosine.p50 = percentile(sortedAll, 0.5);
  metrics.rawCosine.p90 = percentile(sortedAll, 0.9);
  metrics.rawCosine.p95 = percentile(sortedAll, 0.95);
  metrics.rawCosine.p99 = percentile(sortedAll, 0.99);

  const sortedArmed = [...armedRawCosines].sort((a, b) => a - b);
  metrics.armedRawCosine.p50 = percentile(sortedArmed, 0.5);
  metrics.armedRawCosine.p90 = percentile(sortedArmed, 0.9);
  metrics.armedRawCosine.p95 = percentile(sortedArmed, 0.95);
  metrics.armedRawCosine.p99 = percentile(sortedArmed, 0.99);
  metrics.armedRawCosine.max = sortedArmed.at(-1) ?? NaN;

  const firedSegments = metrics.pullSegments.filter((s) => s.fired).length;
  const missedSegments = metrics.pullSegments.filter((s) => !s.fired);
  const segmentsByPhase: Record<string, number> = {};
  for (const seg of missedSegments) {
    segmentsByPhase[seg.phaseAtPeak] = (segmentsByPhase[seg.phaseAtPeak] ?? 0) + 1;
  }

  console.log(`\n=== ${label} ===`);
  console.log(`  frames: ${String(metrics.total)} (detected ${String(metrics.detected)})`);
  console.log(`  phases:`, metrics.phaseCounts);
  console.log(`  fires: ${String(metrics.fired)}`);
  console.log(
    `  pullSegments: ${String(metrics.pullSegments.length)} (fired ${String(firedSegments)}, missed ${String(missedSegments.length)}, single-frame spikes ${String(metrics.singleFrameSpikes)})`
  );
  console.log(`  missed segments by phase:`, segmentsByPhase);
  console.log(
    `  rawCosine overall: min=${formatFixed(metrics.rawCosine.min, 3)} p50=${formatFixed(metrics.rawCosine.p50, 3)} p90=${formatFixed(metrics.rawCosine.p90, 3)} p95=${formatFixed(metrics.rawCosine.p95, 3)} p99=${formatFixed(metrics.rawCosine.p99, 3)} max=${formatFixed(metrics.rawCosine.max, 3)}`
  );
  console.log(
    `  rawCosine armed:   p50=${formatFixed(metrics.armedRawCosine.p50, 3)} p90=${formatFixed(metrics.armedRawCosine.p90, 3)} p95=${formatFixed(metrics.armedRawCosine.p95, 3)} p99=${formatFixed(metrics.armedRawCosine.p99, 3)} max=${formatFixed(metrics.armedRawCosine.max, 3)}`
  );
  console.log(`  near-miss buckets (below threshold, lead-up zone):`, metrics.nearMissBuckets);
  console.log(`  fire indices: [${metrics.firedFrameIndices.join(", ")}]`);
  if (missedSegments.length > 0) {
    console.log(`  missed segments detail:`);
    for (const seg of missedSegments) {
      console.log(
        `    i=${String(seg.startFrame)}-${String(seg.endFrame)} len=${String(seg.length)} peak=${formatFixed(seg.rawPeak, 3)} phase=${seg.phaseAtPeak} ` +
          `gunPose=${formatFixed(seg.gunPoseConfidenceAtPeak, 2)}/active=${String(seg.gunPoseActiveAtPeak)} ` +
          `openFrames=${String(seg.openFramesAtPeak)} nonGunPoseFrames=${String(seg.nonGunPoseFramesAtPeak)} ` +
          `hasSeenStableOpen=${String(seg.hasSeenStableOpenAtPeak)}`
      );
    }
  }

  return metrics;
};

describe("finger-gun benchmark replay", () => {
  for (const label of FIXTURE_LABELS) {
    const fixture = loadFixture(label);
    (fixture ? it : it.skip)(label, () => {
      if (!fixture) return;
      const metrics = replay(fixture, label);
      expect(metrics.total).toBeGreaterThan(0);
      expect(metrics.phaseCounts["armed"] ?? 0).toBeGreaterThan(0);
      expect(metrics.fired).toBeGreaterThanOrEqual(MIN_FIRES_BY_FIXTURE[label]);
    });
  }
});
