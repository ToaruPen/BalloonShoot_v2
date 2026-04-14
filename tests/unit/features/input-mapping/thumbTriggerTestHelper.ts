import type { HandDetection, HandFrame, Point3D } from "../../../../src/shared/types/hand";

export type ThumbTriggerPose = "open" | "latched" | "pulled";

interface ThumbTriggerGeometryOptions {
  scale?: number;
}

const BASE_WIDTH = 640;
const BASE_HEIGHT = 480;

const BASE_LANDMARKS: HandFrame["landmarks"] = {
  wrist: { x: 0.4, y: 0.7, z: 0 },
  indexTip: { x: 0.5, y: 0.3, z: 0 },
  indexMcp: { x: 0.47, y: 0.48, z: 0 },
  thumbIp: { x: 0.37, y: 0.57, z: 0 },
  thumbTip: { x: 0.3, y: 0.6, z: 0 },
  middleTip: { x: 0.45, y: 0.64, z: 0 },
  ringTip: { x: 0.42, y: 0.66, z: 0 },
  pinkyTip: { x: 0.39, y: 0.67, z: 0 }
};

// Canonical poses targeted at cosine values that straddle the default
// triggerReleaseThreshold (-0.3) and triggerPullThreshold (-0.25).
// `pulled` must also sit below the strong-pull override threshold so these
// fixtures exercise the normal debouncer, not the single-frame override.
const TRIGGER_COSINE: Record<ThumbTriggerPose, number> = {
  // Neutral finger-gun: thumb extended outward, well below release.
  open: -0.6,
  // Between release and pull — keeps a latched trigger latched without firing new shots.
  latched: -0.28,
  // Above pull, below strong-pull override cosine — exercises normal debouncer.
  pulled: -0.05
};

const scalePoint = (origin: Point3D, point: Point3D, scale: number): Point3D => ({
  x: origin.x + (point.x - origin.x) * scale,
  y: origin.y + (point.y - origin.y) * scale,
  z: point.z
});

const mirrorPoint = (point: Point3D): Point3D => ({
  ...point,
  x: 1 - point.x
});

// Build a thumbTip such that cos(∠ thumbTip - thumbIp , indexMcp - thumbIp)
// equals the target value in the pixel-space metric used by
// measureThumbCosine. Landmarks are normalized per axis, so we work in
// pixel units (multiply by width/height) and convert back at the end.
// Keeps the original thumb segment length so handScale-independent tests
// stay meaningful.
const createThumbTip = (
  landmarks: HandFrame["landmarks"],
  targetCosine: number,
  frame: { width: number; height: number }
): Point3D => {
  const { indexMcp, thumbIp, thumbTip: originalTip } = landmarks;
  const w = frame.width;
  const h = frame.height;
  const segmentLength =
    Math.hypot(
      (originalTip.x - thumbIp.x) * w,
      (originalTip.y - thumbIp.y) * h,
      (originalTip.z - thumbIp.z) * w
    ) || 1;
  const axisX = (indexMcp.x - thumbIp.x) * w;
  const axisY = (indexMcp.y - thumbIp.y) * h;
  const axisZ = (indexMcp.z - thumbIp.z) * w;
  const axisLength = Math.hypot(axisX, axisY, axisZ) || 1;
  const ax = axisX / axisLength;
  const ay = axisY / axisLength;
  const az = axisZ / axisLength;
  // Pick any unit vector perpendicular to the axis. Using the hand plane
  // perpendicular (rotating the axis 90° in x/y) is deterministic and stable
  // when az is near zero, which holds for the test base landmarks.
  const perpRawX = -ay;
  const perpRawY = ax;
  const perpRawZ = 0;
  const perpLength = Math.hypot(perpRawX, perpRawY, perpRawZ) || 1;
  const px = perpRawX / perpLength;
  const py = perpRawY / perpLength;
  const pz = perpRawZ / perpLength;
  const sinMagnitude = Math.sqrt(Math.max(0, 1 - targetCosine * targetCosine));
  const dx = segmentLength * (targetCosine * ax + sinMagnitude * px);
  const dy = segmentLength * (targetCosine * ay + sinMagnitude * py);
  const dz = segmentLength * (targetCosine * az + sinMagnitude * pz);

  return {
    x: thumbIp.x + dx / w,
    y: thumbIp.y + dy / h,
    z: thumbIp.z + dz / w
  };
};

const FRAME_SIZE = { width: BASE_WIDTH, height: BASE_HEIGHT };

const mapLandmarks = (
  landmarks: HandFrame["landmarks"],
  transform: (point: Point3D) => Point3D
): HandFrame["landmarks"] => ({
  wrist: transform(landmarks.wrist),
  indexTip: transform(landmarks.indexTip),
  indexMcp: transform(landmarks.indexMcp),
  thumbTip: transform(landmarks.thumbTip),
  thumbIp: transform(landmarks.thumbIp),
  middleTip: transform(landmarks.middleTip),
  ringTip: transform(landmarks.ringTip),
  pinkyTip: transform(landmarks.pinkyTip)
});

const createGeometryFrame = (
  targetCosine: number,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => {
  const scale = options.scale ?? 1;
  const landmarks = mapLandmarks(BASE_LANDMARKS, (point) =>
    scalePoint(BASE_LANDMARKS.wrist, point, scale)
  );

  const thumbTip = createThumbTip(landmarks, targetCosine, FRAME_SIZE);

  return {
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    landmarks: { ...landmarks, thumbTip }
  };
};

export const createThumbTriggerFrame = (
  pose: ThumbTriggerPose,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => createGeometryFrame(TRIGGER_COSINE[pose], options);

export const createThumbTriggerFrameFromCosine = (
  targetCosine: number,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => createGeometryFrame(targetCosine, options);

export const withThumbTriggerPose = (
  frame: HandFrame,
  pose: ThumbTriggerPose
): HandFrame => ({
  ...frame,
  landmarks: {
    ...frame.landmarks,
    thumbTip: createThumbTip(frame.landmarks, TRIGGER_COSINE[pose], {
      width: frame.width,
      height: frame.height
    })
  }
});

export const asDetection = (frame: HandFrame): HandDetection => ({
  rawFrame: frame,
  filteredFrame: frame
});

export const mirrorThumbTriggerFrame = (frame: HandFrame): HandFrame => ({
  ...frame,
  landmarks: mapLandmarks(frame.landmarks, mirrorPoint)
});
