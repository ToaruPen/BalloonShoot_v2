/**
 * Explicit lane state for diagnostic workbench and degrade policy.
 */
export type LaneHealthStatus =
  | "notStarted"
  | "waitingForPermission"
  | "waitingForDeviceSelection"
  | "capturing"
  | "tracking"
  | "stalled"
  | "captureLost"
  | "failed";
