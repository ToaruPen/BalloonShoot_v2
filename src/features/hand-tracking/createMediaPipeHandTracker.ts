import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  HandDetection,
  HandFrame,
  HandLandmarkSet,
  HandednessCategory,
  Point3D
} from "../../shared/types/hand";
import { createOneEuroFilter, type OneEuroFilterConfig } from "./oneEuroFilter";

interface LandmarkLike {
  x: number;
  y: number;
  z: number;
}

interface HandednessLike {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

interface HandLandmarkerResultLike {
  landmarks: LandmarkLike[][];
  worldLandmarks?: LandmarkLike[][];
  handedness?: HandednessLike[][];
  handednesses?: HandednessLike[][];
}

export interface MediaPipeHandTracker {
  detect(
    bitmap: ImageBitmap,
    frameAtMs: number
  ): Promise<HandDetection | undefined>;
}

interface MediaPipeHandTrackerOptions {
  getFilterConfig: () => OneEuroFilterConfig;
}

const HAND_LANDMARK_INDEX = {
  wrist: 0,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20
} as const;

type TrackedLandmarkName = keyof typeof HAND_LANDMARK_INDEX;

type OneEuroFilterInstance = ReturnType<typeof createOneEuroFilter>;

const TRACKED_LANDMARK_NAMES = Object.keys(
  HAND_LANDMARK_INDEX
) as TrackedLandmarkName[];

type LandmarkFilters = Record<
  TrackedLandmarkName,
  {
    x: OneEuroFilterInstance;
    y: OneEuroFilterInstance;
    z: OneEuroFilterInstance;
  }
>;

interface LandmarkFiltersBySpace {
  image: LandmarkFilters;
  world: LandmarkFilters;
}

const createLandmarkFilters = (
  getConfig: () => OneEuroFilterConfig
): LandmarkFilters => {
  const filters = {} as LandmarkFilters;

  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name] = {
      x: createOneEuroFilter(getConfig),
      y: createOneEuroFilter(getConfig),
      z: createOneEuroFilter(getConfig)
    };
  }

  return filters;
};

const createSpaceFilters = (
  getConfig: () => OneEuroFilterConfig
): LandmarkFiltersBySpace => ({
  image: createLandmarkFilters(getConfig),
  world: createLandmarkFilters(getConfig)
});

const resetLandmarkFilters = (filters: LandmarkFilters): void => {
  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name].x.reset();
    filters[name].y.reset();
    filters[name].z.reset();
  }
};

const resetSpaceFilters = (filters: LandmarkFiltersBySpace): void => {
  resetLandmarkFilters(filters.image);
  resetLandmarkFilters(filters.world);
};

const filterPoint = (
  point: Point3D,
  filters: LandmarkFilters[TrackedLandmarkName],
  frameAtMs: number
): Point3D => ({
  x: filters.x.filter(point.x, frameAtMs),
  y: filters.y.filter(point.y, frameAtMs),
  z: filters.z.filter(point.z, frameAtMs)
});

// Keep this helper thin: filter timestamp must be supplied at call-site.
const filterHandFrame = (
  raw: HandFrame,
  filters: LandmarkFiltersBySpace,
  frameAtMs: number
): HandFrame => ({
  ...raw,
  landmarks: {
    wrist: filterPoint(raw.landmarks.wrist, filters.image.wrist, frameAtMs),
    thumbIp: filterPoint(
      raw.landmarks.thumbIp,
      filters.image.thumbIp,
      frameAtMs
    ),
    thumbTip: filterPoint(
      raw.landmarks.thumbTip,
      filters.image.thumbTip,
      frameAtMs
    ),
    indexMcp: filterPoint(
      raw.landmarks.indexMcp,
      filters.image.indexMcp,
      frameAtMs
    ),
    indexTip: filterPoint(
      raw.landmarks.indexTip,
      filters.image.indexTip,
      frameAtMs
    ),
    middleTip: filterPoint(
      raw.landmarks.middleTip,
      filters.image.middleTip,
      frameAtMs
    ),
    ringTip: filterPoint(
      raw.landmarks.ringTip,
      filters.image.ringTip,
      frameAtMs
    ),
    pinkyTip: filterPoint(
      raw.landmarks.pinkyTip,
      filters.image.pinkyTip,
      frameAtMs
    )
  },
  ...(raw.worldLandmarks
    ? {
        worldLandmarks: {
          wrist: filterPoint(
            raw.worldLandmarks.wrist,
            filters.world.wrist,
            frameAtMs
          ),
          thumbIp: filterPoint(
            raw.worldLandmarks.thumbIp,
            filters.world.thumbIp,
            frameAtMs
          ),
          thumbTip: filterPoint(
            raw.worldLandmarks.thumbTip,
            filters.world.thumbTip,
            frameAtMs
          ),
          indexMcp: filterPoint(
            raw.worldLandmarks.indexMcp,
            filters.world.indexMcp,
            frameAtMs
          ),
          indexTip: filterPoint(
            raw.worldLandmarks.indexTip,
            filters.world.indexTip,
            frameAtMs
          ),
          middleTip: filterPoint(
            raw.worldLandmarks.middleTip,
            filters.world.middleTip,
            frameAtMs
          ),
          ringTip: filterPoint(
            raw.worldLandmarks.ringTip,
            filters.world.ringTip,
            frameAtMs
          ),
          pinkyTip: filterPoint(
            raw.worldLandmarks.pinkyTip,
            filters.world.pinkyTip,
            frameAtMs
          )
        }
      }
    : {})
});

const toPoint3D = (landmark: LandmarkLike | undefined): Point3D | undefined => {
  if (
    !landmark ||
    !Number.isFinite(landmark.x) ||
    !Number.isFinite(landmark.y) ||
    !Number.isFinite(landmark.z)
  ) {
    return undefined;
  }

  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z
  };
};

const toHandLandmarkSet = (
  landmarks: LandmarkLike[] | undefined
): HandLandmarkSet | undefined => {
  const wrist = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.wrist]);
  const thumbIp = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.thumbIp]);
  const thumbTip = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.thumbTip]);
  const indexMcp = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.indexMcp]);
  const indexTip = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.indexTip]);
  const middleTip = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.middleTip]);
  const ringTip = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.ringTip]);
  const pinkyTip = toPoint3D(landmarks?.[HAND_LANDMARK_INDEX.pinkyTip]);

  if (
    !wrist ||
    !thumbIp ||
    !thumbTip ||
    !indexMcp ||
    !indexTip ||
    !middleTip ||
    !ringTip ||
    !pinkyTip
  ) {
    return undefined;
  }

  return {
    wrist,
    thumbIp,
    thumbTip,
    indexMcp,
    indexTip,
    middleTip,
    ringTip,
    pinkyTip
  };
};

const toHandFrame = (
  result: HandLandmarkerResultLike,
  sourceSize: { width: number; height: number }
): HandFrame | undefined => {
  const landmarks = toHandLandmarkSet(result.landmarks[0]);
  const worldLandmarks = toHandLandmarkSet(result.worldLandmarks?.[0]);

  if (!landmarks) {
    return undefined;
  }

  const selectedHandedness = result.handedness?.[0] ?? result.handednesses?.[0];
  const handedness: HandednessCategory[] | undefined =
    selectedHandedness !== undefined && selectedHandedness.length > 0
      ? selectedHandedness
      : undefined;

  return {
    width: sourceSize.width,
    height: sourceSize.height,
    ...(handedness ? { handedness } : {}),
    landmarks,
    ...(worldLandmarks ? { worldLandmarks } : {})
  };
};

// MediaPipe's WASM runtime is fetched from jsDelivr instead of vendored.
// Vendoring would add ~33 MB of binaries to the repo; the CDN is pinned to the
// same @mediapipe/tasks-vision version declared in package.json.
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

export const createMediaPipeHandTracker = async (
  options: MediaPipeHandTrackerOptions
): Promise<MediaPipeHandTracker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task"
    },
    numHands: 1,
    runningMode: "VIDEO"
  });
  const filters = createSpaceFilters(options.getFilterConfig);

  return {
    detect(
      bitmap: ImageBitmap,
      frameAtMs: number
    ): Promise<HandDetection | undefined> {
      const raw = toHandFrame(
        handLandmarker.detectForVideo(bitmap, frameAtMs),
        {
          width: bitmap.width,
          height: bitmap.height
        }
      );

      if (!raw) {
        resetSpaceFilters(filters);
        return Promise.resolve(undefined);
      }

      const filtered = filterHandFrame(raw, filters, frameAtMs);

      return Promise.resolve({ rawFrame: raw, filteredFrame: filtered });
    }
  };
};
