export {
  FUSION_MAX_FRAME_AGE_MS,
  FUSION_MAX_PAIR_DELTA_MS,
  FUSION_RECENT_FRAME_RETENTION_WINDOW_MS
} from "./fusionConstants";
export {
  coerceFusionTuningValue,
  defaultFusionTuning,
  fusionSliderMetadata
} from "./fusionConfig";
export type {
  FusionTuning,
  FusionTuningKey
} from "./fusionConfig";
export { createFusionFrameBuffers } from "./fusionFrameBuffers";
export {
  pairAimWithSideFrames,
  pairTriggerWithFrontFrames
} from "./pairFusionFrames";
export { createShotEdgeConsumption } from "./shotEdgeConsumption";
export { createFusionTelemetry } from "./fusionTelemetry";
export { createInputFusionMapper } from "./createInputFusionMapper";
export type { InputFusionMapper } from "./createInputFusionMapper";
