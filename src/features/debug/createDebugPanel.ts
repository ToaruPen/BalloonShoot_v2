export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
  handFilterMinCutoff: number;
  handFilterBeta: number;
  fireCooldownFrames: number;
  fireStableAimFrames: number;
  stableCrosshairMaxDelta: number;
  armedEntryConfidenceBonus: number;
  conditionedTriggerPullFloor: number;
  conditionedTriggerReleaseFloor: number;
}

export interface DebugInputElement {
  /** `data-debug` attribute from the HTML, exposed as `dataset.debug` by the DOM. */
  dataset: { debug?: string };
  value: string;
  addEventListener(type: "input", listener: () => void): void;
}

export interface DebugOutputElement {
  dataset: { debugOutput?: string };
  textContent: string | null;
}

export interface DebugTelemetry {
  phase: string;
  rejectReason: string;
  triggerConfidence: number;
  gunPoseConfidence: number;
  openFrames: number;
  pulledFrames: number;
  trackingPresentFrames: number;
  nonGunPoseFrames: number;
  stableAimFrames: number;
  cooldownFramesRemaining: number;
  conditionedTriggerScalar: number;
  conditionedTriggerEdge: string;
  fireEligible: boolean;
  shotFiredMarker: boolean;
  rawIndexJitter: number;
  filterIndexJitter: number;
  rawTriggerProjection: number;
  filterTriggerProjection: number;
}

interface DebugPanel {
  readonly values: DebugValues;
  render(): string;
  bind(
    inputs: Iterable<DebugInputElement>,
    outputs?: Iterable<DebugOutputElement>
  ): void;
  setTelemetry(telemetry: DebugTelemetry | undefined): void;
}

interface DebugControlMeta {
  label: string;
  min: number;
  max: number;
  step: number;
}

type DebugOutputKey =
  | "phase"
  | "rejectReason"
  | "trigger"
  | "gunPose"
  | "counters"
  | "cooldown"
  | "conditionedTrigger"
  | "triggerEdge"
  | "fireEligible"
  | "shotFired"
  | "rawIndexJitter"
  | "filterIndexJitter"
  | "rawTriggerProjection"
  | "filterTriggerProjection";

const HYSTERESIS_GAP = 0.01;

const DEBUG_KEYS = [
  "smoothingAlpha",
  "triggerPullThreshold",
  "triggerReleaseThreshold",
  "handFilterMinCutoff",
  "handFilterBeta",
  "fireCooldownFrames",
  "fireStableAimFrames",
  "stableCrosshairMaxDelta",
  "armedEntryConfidenceBonus",
  "conditionedTriggerPullFloor",
  "conditionedTriggerReleaseFloor"
] as const satisfies readonly (keyof DebugValues)[];

const DEBUG_KEY_SET: ReadonlySet<string> = new Set(DEBUG_KEYS);

const DEBUG_META: Record<keyof DebugValues, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  triggerPullThreshold: { label: "Pull", min: -1, max: 0.4, step: 0.01 },
  triggerReleaseThreshold: { label: "Release", min: -1, max: 0.25, step: 0.01 },
  handFilterMinCutoff: { label: "MinCutoff", min: 0.1, max: 5.0, step: 0.1 },
  handFilterBeta: { label: "Beta", min: 0.0, max: 0.05, step: 0.001 },
  fireCooldownFrames: { label: "Cooldown", min: 0, max: 6, step: 1 },
  fireStableAimFrames: { label: "StableAim", min: 1, max: 6, step: 1 },
  stableCrosshairMaxDelta: { label: "AimDelta", min: 1, max: 40, step: 1 },
  armedEntryConfidenceBonus: { label: "ArmBias", min: 0, max: 0.25, step: 0.01 },
  conditionedTriggerPullFloor: { label: "CondPull", min: -0.5, max: 0.1, step: 0.01 },
  conditionedTriggerReleaseFloor: { label: "CondRelease", min: -0.6, max: 0, step: 0.01 }
};

const DEBUG_OUTPUT_META: Record<DebugOutputKey, string> = {
  phase: "Phase",
  rejectReason: "Reject",
  trigger: "Trigger",
  gunPose: "Pose",
  counters: "Counts",
  cooldown: "Cooldown",
  conditionedTrigger: "CondTrig",
  triggerEdge: "TrigEdge",
  fireEligible: "FireOK",
  shotFired: "Shot",
  rawIndexJitter: "RawJtr",
  filterIndexJitter: "FiltJtr",
  rawTriggerProjection: "RawTrig",
  filterTriggerProjection: "FiltTrig"
};

const DEBUG_OUTPUT_KEYS = Object.keys(DEBUG_OUTPUT_META) as DebugOutputKey[];

const isDebugKey = (key: string | undefined): key is keyof DebugValues =>
  key !== undefined && DEBUG_KEY_SET.has(key);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampToMeta = (key: keyof DebugValues, value: number): number => {
  const meta = DEBUG_META[key];
  const safeValue = Number.isFinite(value) ? value : meta.min;
  return clamp(safeValue, meta.min, meta.max);
};

const countDecimals = (value: number): number => {
  const [, decimals = ""] = String(value).split(".");
  return decimals.length;
};

const formatForInput = (key: keyof DebugValues, value: number): string =>
  String(Number(value.toFixed(countDecimals(DEBUG_META[key].step))));

const formatFixed = (value: number | undefined, decimals: number): string =>
  Number.isFinite(value) ? Number(value).toFixed(decimals) : "--";

const formatTelemetryOutput = (
  key: DebugOutputKey,
  telemetry: DebugTelemetry | undefined
): string => {
  if (!telemetry) {
    return key === "counters" ? "open=0 pull=0 track=0 pose=0" : "--";
  }

  switch (key) {
    case "phase":
      return telemetry.phase;
    case "rejectReason":
      return telemetry.rejectReason;
    case "trigger":
      return formatFixed(telemetry.triggerConfidence, 2);
    case "gunPose":
      return formatFixed(telemetry.gunPoseConfidence, 2);
    case "counters":
      return `open=${String(telemetry.openFrames)} pull=${String(telemetry.pulledFrames)} track=${String(telemetry.trackingPresentFrames)} pose=${String(telemetry.nonGunPoseFrames)} aim=${String(telemetry.stableAimFrames)}`;
    case "cooldown":
      return String(telemetry.cooldownFramesRemaining);
    case "conditionedTrigger":
      return formatFixed(telemetry.conditionedTriggerScalar, 2);
    case "triggerEdge":
      return telemetry.conditionedTriggerEdge;
    case "fireEligible":
      return telemetry.fireEligible ? "yes" : "no";
    case "shotFired":
      return telemetry.shotFiredMarker ? "yes" : "no";
    case "rawIndexJitter":
      return formatFixed(telemetry.rawIndexJitter, 2);
    case "filterIndexJitter":
      return formatFixed(telemetry.filterIndexJitter, 2);
    case "rawTriggerProjection":
      return formatFixed(telemetry.rawTriggerProjection, 3);
    case "filterTriggerProjection":
      return formatFixed(telemetry.filterTriggerProjection, 3);
  }
};

const isDebugOutputKey = (key: string | undefined): key is DebugOutputKey =>
  key !== undefined && DEBUG_OUTPUT_KEYS.includes(key as DebugOutputKey);

const normalizeTriggerThresholds = (
  triggerPullThreshold: number,
  triggerReleaseThreshold: number
): Pick<DebugValues, "triggerPullThreshold" | "triggerReleaseThreshold"> => {
  const normalizedPull = clampToMeta("triggerPullThreshold", triggerPullThreshold);
  const normalizedRelease = clampToMeta("triggerReleaseThreshold", triggerReleaseThreshold);

  return {
    triggerPullThreshold: normalizedPull,
    triggerReleaseThreshold: Math.min(
      normalizedRelease,
      normalizedPull - HYSTERESIS_GAP
    )
  };
};

export const createDebugPanel = (initial: DebugValues): DebugPanel => {
  const values: DebugValues = {
    smoothingAlpha: clampToMeta("smoothingAlpha", initial.smoothingAlpha),
    handFilterMinCutoff: clampToMeta("handFilterMinCutoff", initial.handFilterMinCutoff),
    handFilterBeta: clampToMeta("handFilterBeta", initial.handFilterBeta),
    fireCooldownFrames: clampToMeta("fireCooldownFrames", initial.fireCooldownFrames),
    fireStableAimFrames: clampToMeta("fireStableAimFrames", initial.fireStableAimFrames),
    stableCrosshairMaxDelta: clampToMeta(
      "stableCrosshairMaxDelta",
      initial.stableCrosshairMaxDelta
    ),
    armedEntryConfidenceBonus: clampToMeta(
      "armedEntryConfidenceBonus",
      initial.armedEntryConfidenceBonus
    ),
    conditionedTriggerPullFloor: clampToMeta(
      "conditionedTriggerPullFloor",
      initial.conditionedTriggerPullFloor
    ),
    conditionedTriggerReleaseFloor: clampToMeta(
      "conditionedTriggerReleaseFloor",
      initial.conditionedTriggerReleaseFloor
    ),
    ...normalizeTriggerThresholds(
      initial.triggerPullThreshold,
      initial.triggerReleaseThreshold
    )
  };
  const boundInputs: Partial<Record<keyof DebugValues, DebugInputElement>> = {};
  const boundOutputs: Partial<Record<DebugOutputKey, DebugOutputElement>> = {};
  let telemetry: DebugTelemetry | undefined;

  const renderRow = (key: keyof DebugValues): string => {
    const meta = DEBUG_META[key];
    return `<label class="debug-panel-row">${meta.label}<input data-debug="${key}" type="range" min="${String(meta.min)}" max="${String(meta.max)}" step="${String(meta.step)}" value="${formatForInput(key, values[key])}" /></label>`;
  };

  const render = (): string => {
    const rows = DEBUG_KEYS.map(renderRow).join("");
    const telemetryRows = DEBUG_OUTPUT_KEYS.map(
      (key) =>
        `<div class="debug-panel-row"><span>${DEBUG_OUTPUT_META[key]}</span><output data-debug-output="${key}">${formatTelemetryOutput(key, telemetry)}</output></div>`
    ).join("");
    return `<aside class="debug-panel" aria-label="debug controls">${rows}${telemetryRows}</aside>`;
  };

  const syncInputValue = (key: keyof DebugValues): void => {
    const input = boundInputs[key];

    if (!input) {
      return;
    }

    input.value = formatForInput(key, values[key]);
  };

  const normalizeAndSyncThresholds = (): void => {
    const normalized = normalizeTriggerThresholds(
      values.triggerPullThreshold,
      values.triggerReleaseThreshold
    );
    values.triggerPullThreshold = normalized.triggerPullThreshold;
    values.triggerReleaseThreshold = normalized.triggerReleaseThreshold;
    syncInputValue("triggerPullThreshold");
    syncInputValue("triggerReleaseThreshold");
  };

  const syncTelemetryOutput = (key: DebugOutputKey): void => {
    const output = boundOutputs[key];

    if (!output) {
      return;
    }

    output.textContent = formatTelemetryOutput(key, telemetry);
  };

  const setTelemetry = (nextTelemetry: DebugTelemetry | undefined): void => {
    telemetry = nextTelemetry;

    for (const key of DEBUG_OUTPUT_KEYS) {
      syncTelemetryOutput(key);
    }
  };

  const bind = (
    inputs: Iterable<DebugInputElement>,
    outputs: Iterable<DebugOutputElement> = []
  ): void => {
    for (const input of inputs) {
      const boundKey = input.dataset.debug;

      if (isDebugKey(boundKey)) {
        boundInputs[boundKey] = input;
      }

      input.addEventListener("input", () => {
        const key = input.dataset.debug;

        if (!isDebugKey(key)) {
          return;
        }

        const parsed = Number(input.value);

        if (!Number.isFinite(parsed)) {
          return;
        }

        values[key] = clampToMeta(key, parsed);
        syncInputValue(key);

        if (key === "triggerPullThreshold" || key === "triggerReleaseThreshold") {
          normalizeAndSyncThresholds();
        }
      });
    }

    for (const output of outputs) {
      const key = output.dataset.debugOutput;

      if (!isDebugOutputKey(key)) {
        continue;
      }

      boundOutputs[key] = output;
      syncTelemetryOutput(key);
    }
  };

  return { values, render, bind, setTelemetry };
};
