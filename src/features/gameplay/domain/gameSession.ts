export type CountdownLabel = "3" | "2" | "1" | "start";

interface IdleGameSession {
  readonly state: "idle";
  readonly countdownLabel: undefined;
  readonly timeRemainingMs: number;
  readonly justStartedPlaying: false;
  readonly resultEntered: false;
}

interface CountdownGameSession {
  readonly state: "countdown";
  readonly countdownStartedAtMs: number;
  readonly countdownLabel: CountdownLabel;
  readonly timeRemainingMs: number;
  readonly justStartedPlaying: false;
  readonly resultEntered: false;
}

interface PlayingGameSession {
  readonly state: "playing";
  readonly playingStartedAtMs: number;
  readonly timeRemainingMs: number;
  readonly countdownLabel: undefined;
  readonly justStartedPlaying: boolean;
  readonly resultEntered: false;
}

interface ResultGameSession {
  readonly state: "result";
  readonly playingStartedAtMs: number;
  readonly timeRemainingMs: 0;
  readonly countdownLabel: undefined;
  readonly justStartedPlaying: false;
  readonly resultEntered: boolean;
}

export type GameSession =
  | IdleGameSession
  | CountdownGameSession
  | PlayingGameSession
  | ResultGameSession;

const COUNTDOWN_DURATION_MS = 4_000;
const GAME_DURATION_MS = 60_000;

const countdownLabelForElapsed = (elapsedMs: number): CountdownLabel => {
  if (elapsedMs < 1_000) {
    return "3";
  }

  if (elapsedMs < 2_000) {
    return "2";
  }

  if (elapsedMs < 3_000) {
    return "1";
  }

  return "start";
};

export const createInitialGameSession = (): GameSession => ({
  state: "idle",
  countdownLabel: undefined,
  timeRemainingMs: GAME_DURATION_MS,
  justStartedPlaying: false,
  resultEntered: false
});

export const startGameSession = (
  session: GameSession,
  nowMs: number
): GameSession => {
  if (session.state !== "idle") {
    return session;
  }

  return {
    state: "countdown",
    countdownStartedAtMs: nowMs,
    countdownLabel: "3",
    timeRemainingMs: GAME_DURATION_MS,
    justStartedPlaying: false,
    resultEntered: false
  };
};

export const advanceGameSession = (
  session: GameSession,
  nowMs: number
): GameSession => {
  if (session.state === "countdown") {
    const elapsedMs = nowMs - session.countdownStartedAtMs;

    if (elapsedMs < COUNTDOWN_DURATION_MS) {
      return {
        ...session,
        countdownLabel: countdownLabelForElapsed(elapsedMs)
      };
    }

    return {
      state: "playing",
      playingStartedAtMs: session.countdownStartedAtMs + COUNTDOWN_DURATION_MS,
      countdownLabel: undefined,
      timeRemainingMs: GAME_DURATION_MS,
      justStartedPlaying: true,
      resultEntered: false
    };
  }

  if (session.state === "playing") {
    const elapsedMs = nowMs - session.playingStartedAtMs;
    const timeRemainingMs = Math.max(0, GAME_DURATION_MS - elapsedMs);

    if (timeRemainingMs === 0) {
      return {
        state: "result",
        playingStartedAtMs: session.playingStartedAtMs,
        countdownLabel: undefined,
        timeRemainingMs: 0,
        justStartedPlaying: false,
        resultEntered: true
      };
    }

    return {
      ...session,
      timeRemainingMs,
      justStartedPlaying: false
    };
  }

  if (session.state === "result") {
    return { ...session, resultEntered: false };
  }

  return session;
};

export const retryGameSession = (
  _session: GameSession,
  nowMs: number
): GameSession => startGameSession(createInitialGameSession(), nowMs);
