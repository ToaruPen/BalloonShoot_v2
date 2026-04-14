import { describe, expect, it } from "vitest";
import {
  createDebugPanel,
  type DebugInputElement,
  type DebugOutputElement,
  type DebugTelemetry,
  type DebugValues
} from "../../../../src/features/debug/createDebugPanel";

const sampleInitial: DebugValues = {
  smoothingAlpha: 0.28,
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1,
  handFilterMinCutoff: 1.0,
  handFilterBeta: 0,
  fireCooldownFrames: 2,
  fireStableAimFrames: 2,
  stableCrosshairMaxDelta: 18,
  armedEntryConfidenceBonus: 0.05,
  conditionedTriggerPullFloor: -0.12,
  conditionedTriggerReleaseFloor: -0.28
};

interface FakeInput extends DebugInputElement {
  fireInput: () => void;
}

type FakeOutput = DebugOutputElement;

const createFakeInput = (key: string, initialValue: string): FakeInput => {
  let listener: (() => void) | undefined;
  const addEventListener = (type: string, cb: () => void): void => {
    if (type !== "input") {
      throw new Error(`Unexpected event type: ${type}`);
    }

    listener = cb;
  };
  const input: FakeInput = {
    dataset: { debug: key },
    value: initialValue,
    addEventListener: addEventListener as DebugInputElement["addEventListener"],
    fireInput: () => {
      if (listener) {
        listener();
      }
    }
  };
  return input;
};

const createFakeOutput = (key: string): FakeOutput => ({
  dataset: { debugOutput: key },
  textContent: ""
});

const sampleTelemetry: DebugTelemetry = {
  phase: "armed",
  rejectReason: "waiting_for_stable_pulled",
  triggerConfidence: 0.67,
  gunPoseConfidence: 0.91,
  openFrames: 0,
  pulledFrames: 1,
  trackingPresentFrames: 4,
  nonGunPoseFrames: 0,
  stableAimFrames: 3,
  cooldownFramesRemaining: 1,
  conditionedTriggerScalar: 0.92,
  conditionedTriggerEdge: "pull",
  fireEligible: true,
  shotFiredMarker: true,
  rawIndexJitter: 0.12,
  filterIndexJitter: 0.03,
  rawTriggerProjection: 0.128,
  filterTriggerProjection: 0.054
};

describe("createDebugPanel", () => {
  it("starts with a copy of the initial values", () => {
    const panel = createDebugPanel(sampleInitial);

    expect(panel.values).toEqual(sampleInitial);
    expect(panel.values).not.toBe(sampleInitial);
  });

  it("renders a labelled slider for every debug key with current values", () => {
    const panel = createDebugPanel(sampleInitial);

    const html = panel.render();

    expect(html).toContain('class="debug-panel"');
    expect(html).toContain('data-debug="smoothingAlpha"');
    expect(html).toContain('data-debug="triggerPullThreshold"');
    expect(html).toContain('data-debug="triggerReleaseThreshold"');
    expect(html).toContain('value="0.28"');
    expect(html).toContain('value="0.18"');
    expect(html).toContain('value="0.1"');
    expect(html).toContain('min="-1"');
    expect(html).toContain('max="0.4"');
    expect(html).toContain('max="0.25"');
    expect(html).toContain('data-debug-output="phase"');
    expect(html).toContain('data-debug-output="rejectReason"');
    expect(html).toContain('data-debug-output="trigger"');
    expect(html).toContain('data-debug-output="gunPose"');
    expect(html).toContain('data-debug-output="counters"');
    expect(html).toContain('data-debug="fireCooldownFrames"');
    expect(html).toContain('data-debug="fireStableAimFrames"');
    expect(html).toContain('data-debug="stableCrosshairMaxDelta"');
    expect(html).toContain('data-debug="armedEntryConfidenceBonus"');
    expect(html).toContain('data-debug="conditionedTriggerPullFloor"');
    expect(html).toContain('data-debug="conditionedTriggerReleaseFloor"');
    expect(html).toContain('data-debug-output="cooldown"');
    expect(html).toContain('data-debug-output="conditionedTrigger"');
    expect(html).toContain('data-debug-output="triggerEdge"');
    expect(html).toContain('data-debug-output="fireEligible"');
    expect(html).toContain('data-debug-output="shotFired"');
  });

  it("renders compact runtime telemetry into bound debug outputs", () => {
    const panel = createDebugPanel(sampleInitial);
    const phase = createFakeOutput("phase");
    const rejectReason = createFakeOutput("rejectReason");
    const trigger = createFakeOutput("trigger");
    const gunPose = createFakeOutput("gunPose");
    const counters = createFakeOutput("counters");
    const cooldown = createFakeOutput("cooldown");
    const conditionedTrigger = createFakeOutput("conditionedTrigger");
    const triggerEdge = createFakeOutput("triggerEdge");
    const fireEligible = createFakeOutput("fireEligible");
    const shotFired = createFakeOutput("shotFired");

    panel.bind([], [
      phase,
      rejectReason,
      trigger,
      gunPose,
      counters,
      cooldown,
      conditionedTrigger,
      triggerEdge,
      fireEligible,
      shotFired
    ]);
    panel.setTelemetry(sampleTelemetry);

    expect(phase.textContent).toBe("armed");
    expect(rejectReason.textContent).toBe("waiting_for_stable_pulled");
    expect(trigger.textContent).toBe("0.67");
    expect(gunPose.textContent).toBe("0.91");
    expect(counters.textContent).toBe("open=0 pull=1 track=4 pose=0 aim=3");
    expect(cooldown.textContent).toBe("1");
    expect(conditionedTrigger.textContent).toBe("0.92");
    expect(triggerEdge.textContent).toBe("pull");
    expect(fireEligible.textContent).toBe("yes");
    expect(shotFired.textContent).toBe("yes");
  });

  it("updates values in place when bound inputs fire", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([smoothing, pull, release]);

    smoothing.value = "0.42";
    smoothing.fireInput();
    pull.value = "0.35";
    pull.fireInput();
    release.value = "0.08";
    release.fireInput();

    expect(panel.values.smoothingAlpha).toBeCloseTo(0.42);
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.35);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.08);
  });

  it("keeps release at least one step below pull when either threshold changes", () => {
    const panel = createDebugPanel(sampleInitial);
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([pull, release]);

    release.value = "0.3";
    release.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.18);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.17);
    expect(pull.value).toBe("0.18");
    expect(release.value).toBe("0.17");

    pull.value = "0.12";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.12);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.11);
    expect(pull.value).toBe("0.12");
    expect(release.value).toBe("0.11");
  });

  it("keeps the values reference stable so external loops can hold it", () => {
    const panel = createDebugPanel(sampleInitial);
    const ref = panel.values;

    panel.bind([]);

    expect(panel.values).toBe(ref);
  });

  it("ignores inputs whose debug key is not a known DebugValues field", () => {
    const panel = createDebugPanel(sampleInitial);
    const foreign = createFakeInput("nonsense", "0.99");

    panel.bind([foreign]);
    foreign.fireInput();

    expect(panel.values).toEqual(sampleInitial);
  });

  it("ignores non-finite input values so stale sliders cannot poison the config", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");

    panel.bind([smoothing]);

    smoothing.value = "not-a-number";
    smoothing.fireInput();

    expect(panel.values.smoothingAlpha).toBe(sampleInitial.smoothingAlpha);
  });

  it("clamps out-of-range values to the slider bounds", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([smoothing, pull, release]);

    smoothing.value = "0.9";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.6);

    smoothing.value = "0.05";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.1);

    pull.value = "0.8";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.4);

    pull.value = "-2";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(-1);

    // Release clamps to its own max (0.25) and then to pull - gap.
    pull.value = "0.05";
    pull.fireInput();
    release.value = "0.5";
    release.fireInput();
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.04);

    release.value = "-2";
    release.fireInput();
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(-1);
  });

  it("clamps out-of-range initial values so untrusted config cannot render outside bounds", () => {
    const panel = createDebugPanel({
      smoothingAlpha: 0.05,
      triggerPullThreshold: 0.06,
      triggerReleaseThreshold: 0.25,
      handFilterMinCutoff: 1.0,
      handFilterBeta: 0,
      fireCooldownFrames: 2,
      fireStableAimFrames: 2,
      stableCrosshairMaxDelta: 18,
      armedEntryConfidenceBonus: 0.05,
      conditionedTriggerPullFloor: -0.12,
      conditionedTriggerReleaseFloor: -0.28
    });

    expect(panel.values.smoothingAlpha).toBeCloseTo(0.1);
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.06);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.05);
  });

  it("renders sliders for the hand-filter keys with their meta bounds", () => {
    const panel = createDebugPanel(sampleInitial);

    const html = panel.render();

    expect(html).toContain('data-debug="handFilterMinCutoff"');
    expect(html).toContain('data-debug="handFilterBeta"');
    expect(html).toContain('data-debug="fireCooldownFrames"');
    expect(html).toContain('data-debug="fireStableAimFrames"');
    expect(html).toContain('data-debug="stableCrosshairMaxDelta"');
    expect(html).toContain('data-debug="armedEntryConfidenceBonus"');
    expect(html).toContain('data-debug="conditionedTriggerPullFloor"');
    expect(html).toContain('data-debug="conditionedTriggerReleaseFloor"');
    expect(html).toContain('min="0.1"');
    expect(html).toContain('max="5"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="0.05"');
    expect(html).toContain('step="0.001"');
  });

  it("updates hand-filter values when bound inputs fire", () => {
    const panel = createDebugPanel(sampleInitial);
    const minCutoff = createFakeInput("handFilterMinCutoff", "1");
    const beta = createFakeInput("handFilterBeta", "0");

    panel.bind([minCutoff, beta]);

    minCutoff.value = "2.5";
    minCutoff.fireInput();
    beta.value = "0.03";
    beta.fireInput();

    expect(panel.values.handFilterMinCutoff).toBeCloseTo(2.5);
    expect(panel.values.handFilterBeta).toBeCloseTo(0.03);
  });

  it("clamps hand-filter values to their slider bounds", () => {
    const panel = createDebugPanel(sampleInitial);
    const minCutoff = createFakeInput("handFilterMinCutoff", "1");
    const beta = createFakeInput("handFilterBeta", "0");

    panel.bind([minCutoff, beta]);

    minCutoff.value = "99";
    minCutoff.fireInput();
    expect(panel.values.handFilterMinCutoff).toBeCloseTo(5);

    minCutoff.value = "0.001";
    minCutoff.fireInput();
    expect(panel.values.handFilterMinCutoff).toBeCloseTo(0.1);

    beta.value = "1";
    beta.fireInput();
    expect(panel.values.handFilterBeta).toBeCloseTo(0.05);

    beta.value = "-1";
    beta.fireInput();
    expect(panel.values.handFilterBeta).toBeCloseTo(0);
  });

  it("clamps hand-filter initial values so untrusted config cannot render outside bounds", () => {
    const panel = createDebugPanel({
      smoothingAlpha: 0.28,
      triggerPullThreshold: 0.18,
      triggerReleaseThreshold: 0.1,
      handFilterMinCutoff: 20,
      handFilterBeta: -5,
      fireCooldownFrames: 20,
      fireStableAimFrames: 0,
      stableCrosshairMaxDelta: 99,
      armedEntryConfidenceBonus: -1,
      conditionedTriggerPullFloor: 0.5,
      conditionedTriggerReleaseFloor: -2
    });

    expect(panel.values.handFilterMinCutoff).toBeCloseTo(5);
    expect(panel.values.handFilterBeta).toBeCloseTo(0);
    expect(panel.values.fireCooldownFrames).toBe(6);
    expect(panel.values.fireStableAimFrames).toBe(1);
    expect(panel.values.stableCrosshairMaxDelta).toBe(40);
    expect(panel.values.armedEntryConfidenceBonus).toBe(0);
  });

  it("renders raw and filtered index-tip jitter telemetry into bound outputs", () => {
    const panel = createDebugPanel(sampleInitial);
    const rawJitterOutput = createFakeOutput("rawIndexJitter");
    const filterJitterOutput = createFakeOutput("filterIndexJitter");

    panel.bind([], [rawJitterOutput, filterJitterOutput]);
    panel.setTelemetry(sampleTelemetry);

    expect(rawJitterOutput.textContent).toBe("0.12");
    expect(filterJitterOutput.textContent).toBe("0.03");
  });

  it("renders raw and filtered trigger projection at 3 decimal precision", () => {
    const panel = createDebugPanel(sampleInitial);
    const rawTriggerOutput = createFakeOutput("rawTriggerProjection");
    const filterTriggerOutput = createFakeOutput("filterTriggerProjection");

    panel.bind([], [rawTriggerOutput, filterTriggerOutput]);
    panel.setTelemetry(sampleTelemetry);

    expect(rawTriggerOutput.textContent).toBe("0.128");
    expect(filterTriggerOutput.textContent).toBe("0.054");
  });
});
