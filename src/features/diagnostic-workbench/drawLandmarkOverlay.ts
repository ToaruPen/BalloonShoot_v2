import type { HandFrame, HandLandmarkSet } from "../../shared/types/hand";

// ---------------------------------------------------------------------------
// Landmark connections for drawing bones between joints
// ---------------------------------------------------------------------------

type LandmarkName = keyof HandLandmarkSet;

const CONNECTIONS: readonly [LandmarkName, LandmarkName][] = [
  ["wrist", "thumbIp"],
  ["thumbIp", "thumbTip"],
  ["wrist", "indexMcp"],
  ["indexMcp", "indexTip"],
  ["wrist", "middleTip"],
  ["wrist", "ringTip"],
  ["wrist", "pinkyTip"]
];

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const drawLandmarks = (
  ctx: CanvasRenderingContext2D,
  landmarks: HandLandmarkSet,
  w: number,
  h: number,
  dotColor: string,
  lineColor: string,
  dotRadius: number
): void => {
  // Draw connections
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  for (const [from, to] of CONNECTIONS) {
    const a = landmarks[from];
    const b = landmarks[to];
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  // Draw dots
  ctx.fillStyle = dotColor;
  const names = Object.keys(landmarks) as LandmarkName[];
  for (const name of names) {
    const pt = landmarks[name];
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LandmarkOverlayOptions {
  /** Show raw landmarks (red). */
  readonly showRaw: boolean;
  /** Show filtered landmarks (green). */
  readonly showFiltered: boolean;
}

const DEFAULT_OPTIONS: LandmarkOverlayOptions = {
  showRaw: true,
  showFiltered: true
};

/**
 * Draw raw and/or filtered landmark overlays on a canvas that is
 * sized to match the video feed. The canvas should overlay the
 * `<video>` element in CSS.
 */
export const drawLandmarkOverlay = (
  ctx: CanvasRenderingContext2D,
  frame: HandFrame | undefined,
  filteredFrame: HandFrame | undefined,
  opts: LandmarkOverlayOptions = DEFAULT_OPTIONS
): void => {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (opts.showRaw && frame !== undefined) {
    drawLandmarks(
      ctx,
      frame.landmarks,
      w,
      h,
      "rgba(255, 80, 80, 0.8)",   // red dots
      "rgba(255, 80, 80, 0.4)",   // red lines
      3
    );
  }

  if (opts.showFiltered && filteredFrame !== undefined) {
    drawLandmarks(
      ctx,
      filteredFrame.landmarks,
      w,
      h,
      "rgba(80, 255, 120, 0.9)",  // green dots
      "rgba(80, 255, 120, 0.5)",  // green lines
      4
    );
  }
};
