import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  HandFrame,
  HandLandmarkSet,
  HandednessCategory,
  Point3D
} from "../shared/types/hand";

const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

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

export interface ExtractedFrame {
  tMs: number;
  frame: HandFrame | null;
}

export interface ExtractionResult {
  source: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  frames: ExtractedFrame[];
}

const toPoint3D = (lm: LandmarkLike | undefined): Point3D | undefined =>
  lm ? { x: lm.x, y: lm.y, z: lm.z } : undefined;

const toHandLandmarkSet = (
  landmarks: LandmarkLike[] | undefined
): HandLandmarkSet | undefined => {
  if (!landmarks) return undefined;

  const wrist = toPoint3D(landmarks[HAND_LANDMARK_INDEX.wrist]);
  const thumbIp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbIp]);
  const thumbTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbTip]);
  const indexMcp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexMcp]);
  const indexTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexTip]);
  const middleTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.middleTip]);
  const ringTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.ringTip]);
  const pinkyTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.pinkyTip]);

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

  return { wrist, thumbIp, thumbTip, indexMcp, indexTip, middleTip, ringTip, pinkyTip };
};

const toHandFrame = (
  landmarks: LandmarkLike[] | undefined,
  worldLandmarks: LandmarkLike[] | undefined,
  handedness: HandednessLike[] | undefined,
  width: number,
  height: number
): HandFrame | null => {
  const imageLandmarks = toHandLandmarkSet(landmarks);
  const metricLandmarks = toHandLandmarkSet(worldLandmarks);

  if (!imageLandmarks) return null;

  const handednessCategory: HandednessCategory[] | undefined =
    handedness && handedness.length > 0 ? handedness : undefined;
  return {
    width,
    height,
    ...(handednessCategory ? { handedness: handednessCategory } : {}),
    landmarks: imageLandmarks,
    ...(metricLandmarks ? { worldLandmarks: metricLandmarks } : {})
  };
};

const statusEl = (): HTMLElement => {
  const el = document.getElementById("status");
  if (!el) throw new Error("status element missing");
  return el;
};

const setStatus = (msg: string): void => {
  statusEl().textContent = msg;
};

let visionFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | undefined;

// HandLandmarker in VIDEO mode requires monotonically increasing timestamps.
// Running multiple clips back-to-back would trip the internal check, so each
// extraction gets a fresh landmarker that is disposed afterwards.
const createHandLandmarker = async (): Promise<HandLandmarker> => {
  if (!visionFileset) {
    setStatus("loading MediaPipe…");
    visionFileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  }
  return HandLandmarker.createFromOptions(visionFileset, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
    numHands: 1,
    runningMode: "VIDEO"
  });
};

// Step a video element through every frame and feed it into HandLandmarker.
// Uses seeked events rather than requestVideoFrameCallback so we can force
// exact, deterministic frame stepping regardless of browser scheduling.
const extractFromVideo = async (
  sourceLabel: string,
  videoBytes: Uint8Array,
  mimeType: string
): Promise<ExtractionResult> => {
  const landmarker = await createHandLandmarker();
  setStatus(`preparing video (${sourceLabel})…`);
  const blob = new Blob([new Uint8Array(videoBytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  document.body.appendChild(video);
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => { resolve(); };
      video.onerror = () => { reject(new Error("video load failed")); };
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationMs = video.duration * 1000;
    // Estimate fps from duration. Photo Booth writes 30fps; fall back to 30 if unknown.
    const fps = 30;
    const frameIntervalMs = 1000 / fps;
    const frameCount = Math.floor(durationMs / frameIntervalMs);
    const frames: ExtractedFrame[] = [];
    setStatus(`extracting ${String(frameCount)} frames from ${sourceLabel}…`);
    for (let i = 0; i < frameCount; i += 1) {
      const tMs = i * frameIntervalMs;
      video.currentTime = tMs / 1000;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => { resolve(); };
        video.onerror = () => { reject(new Error("video seek failed")); };
      });
      const result = landmarker.detectForVideo(video, tMs);
      const hand = toHandFrame(
        result.landmarks[0],
        result.worldLandmarks[0],
        result.handedness[0],
        width,
        height
      );
      frames.push({ tMs, frame: hand });
      if (i % 60 === 0) {
        setStatus(`extracting ${sourceLabel}: ${String(i)}/${String(frameCount)}`);
      }
    }
    return { source: sourceLabel, width, height, fps, durationMs, frames };
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
    landmarker.close();
  }
};

declare global {
  interface Window {
    __benchHarnessReady: boolean;
    runExtraction: (
      sourceLabel: string,
      videoBytes: Uint8Array,
      mimeType: string
    ) => Promise<ExtractionResult>;
  }
}

window.runExtraction = extractFromVideo;
window.__benchHarnessReady = true;
setStatus("ready");
