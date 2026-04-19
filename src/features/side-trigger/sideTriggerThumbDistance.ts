import type { HandLandmarkSet, Point3D } from "../../shared/types/hand";

const MIN_REFERENCE_LENGTH = 0.0001;

const distance = (a: Point3D, b: Point3D): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const computeNormalizedThumbDistance = (
  worldLandmarks: HandLandmarkSet
): number => {
  const referenceLength = Math.max(
    MIN_REFERENCE_LENGTH,
    distance(worldLandmarks.wrist, worldLandmarks.indexMcp)
  );
  const thumbClosureTarget =
    worldLandmarks.middleMcp ?? worldLandmarks.indexMcp;

  return distance(worldLandmarks.thumbTip, thumbClosureTarget) /
    referenceLength;
};
