import type { OneEuroFilterConfig } from "../hand-tracking/oneEuroFilter";
import { gameConfig } from "../../shared/config/gameConfig";

// Side trigger currently reads raw landmarks, but the tracker still emits
// filteredFrame. Keep this side-owned getter on neutral 1 euro defaults until
// side-filter tuning has evidence of needing different smoothing.
const SIDE_TRIGGER_FILTER_CONFIG: OneEuroFilterConfig = {
  minCutoff: gameConfig.input.handFilterMinCutoff,
  beta: gameConfig.input.handFilterBeta,
  dCutoff: gameConfig.input.handFilterDCutoff
};

export const getSideTriggerFilterConfig = (): OneEuroFilterConfig => ({
  ...SIDE_TRIGGER_FILTER_CONFIG
});
