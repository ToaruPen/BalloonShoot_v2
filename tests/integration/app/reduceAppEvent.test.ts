import { describe, expect, it } from "vitest";
import { createInitialAppState, reduceAppEvent } from "../../../src/app/state/reduceAppEvent";
import type { AppState } from "../../../src/app/state/appState";

const createPlayingState = (overrides?: Partial<Extract<AppState, { screen: "playing" }>>): AppState => ({
  screen: "playing",
  score: 0,
  combo: 0,
  multiplier: 1,
  ...overrides
});

const createResultState = (overrides?: Partial<Extract<AppState, { screen: "result" }>>): AppState => ({
  screen: "result",
  score: 0,
  combo: 0,
  multiplier: 1,
  ...overrides
});

describe("reduceAppEvent", () => {
  it("moves from camera-ready to countdown to playing", () => {
    let state = createInitialAppState();

    state = reduceAppEvent(state, { type: "CAMERA_READY" });
    state = reduceAppEvent(state, { type: "START_CLICKED" });
    expect(state).toMatchObject({ screen: "countdown", countdown: 3 });
    state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining: 0 });

    expect(state.screen).toBe("playing");
  });

  it("moves to result when time expires", () => {
    const state = reduceAppEvent(
      createPlayingState({ score: 12 }),
      { type: "TIME_UP" }
    );

    expect(state.screen).toBe("result");
    expect(state.score).toBe(12);
  });

  it("syncs score payloads into the playing state", () => {
    const state = reduceAppEvent(
      createPlayingState(),
      { type: "SCORE_SYNC", score: 9, combo: 3, multiplier: 2 }
    );

    expect(state.score).toBe(9);
    expect(state.combo).toBe(3);
    expect(state.multiplier).toBe(2);
  });

  it("resets back to the permission screen on retry", () => {
    const state = reduceAppEvent(createResultState({ score: 14 }), { type: "RETRY_CLICKED" });

    expect(state).toEqual(createInitialAppState());
  });

  it("ignores score sync before the round is active", () => {
    const state = createInitialAppState();

    expect(reduceAppEvent(state, { type: "SCORE_SYNC", score: 5, combo: 2, multiplier: 3 })).toBe(
      state
    );
  });

  it("ignores retry clicks outside the result screen", () => {
    const state = createPlayingState({ score: 14, combo: 4, multiplier: 2 });

    expect(reduceAppEvent(state, { type: "RETRY_CLICKED" })).toBe(state);
  });

  it("rejects start clicks when the app is not ready", () => {
    const state = createPlayingState();

    expect(reduceAppEvent(state, { type: "START_CLICKED" })).toBe(state);
  });
});
