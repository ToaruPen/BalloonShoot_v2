interface HudState {
  score: number;
  combo: number;
  multiplier: number;
}

export type AppState =
  | (HudState & {
      screen: "permission";
      countdown: number;
    })
  | (HudState & {
      screen: "ready";
      countdown: number;
    })
  | (HudState & {
      screen: "countdown";
      countdown: number;
    })
  | (HudState & {
      screen: "playing";
    })
  | (HudState & {
      screen: "result";
    });

export type AppEvent =
  | { type: "CAMERA_READY" }
  | { type: "START_CLICKED" }
  | { type: "COUNTDOWN_TICK"; secondsRemaining: number }
  | { type: "TIME_UP" }
  | { type: "SCORE_SYNC"; score: number; combo: number; multiplier: number }
  | { type: "RETRY_CLICKED" };
