import type { AppEvent, AppState } from "./appState";

export const createInitialAppState = (): AppState => ({
  screen: "permission",
  score: 0,
  combo: 0,
  multiplier: 1,
  countdown: 3
});

const applyCountdownTick = (
  state: Extract<AppState, { screen: "countdown" }>,
  secondsRemaining: number
): AppState =>
  secondsRemaining <= 0
    ? {
        screen: "playing",
        score: state.score,
        combo: state.combo,
        multiplier: state.multiplier
      }
    : { ...state, countdown: secondsRemaining };

const applyScoreSync = (state: AppState, event: Extract<AppEvent, { type: "SCORE_SYNC" }>): AppState =>
  state.screen === "playing" || state.screen === "result"
    ? {
        ...state,
        score: event.score,
        combo: event.combo,
        multiplier: event.multiplier
      }
    : state;

export const reduceAppEvent = (state: AppState, event: AppEvent): AppState => {
  switch (event.type) {
    case "CAMERA_READY":
      return state.screen === "permission" ? { ...state, screen: "ready" } : state;
    case "START_CLICKED":
      return state.screen === "ready" ? { ...state, screen: "countdown", countdown: 3 } : state;
    case "COUNTDOWN_TICK":
      return state.screen === "countdown" ? applyCountdownTick(state, event.secondsRemaining) : state;
    case "TIME_UP":
      return state.screen === "playing" ? { ...state, screen: "result" } : state;
    case "SCORE_SYNC":
      return applyScoreSync(state, event);
    case "RETRY_CLICKED":
      return state.screen === "result" ? createInitialAppState() : state;
  }
};
