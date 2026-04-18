import { describe, expect, it } from "vitest";
import {
  advanceGameSession,
  createInitialGameSession,
  retryGameSession,
  startGameSession
} from "../../../../src/features/gameplay/domain/gameSession";

describe("gameSession", () => {
  it("starts idle and enters countdown on start", () => {
    const session = startGameSession(createInitialGameSession(), 1_000);

    expect(session.state).toBe("countdown");
    expect(session.countdownLabel).toBe("3");
  });

  it("keeps countdown labels stable at exact boundaries", () => {
    const session = startGameSession(createInitialGameSession(), 1_000);

    expect(advanceGameSession(session, 1_999).countdownLabel).toBe("3");
    expect(advanceGameSession(session, 2_000).countdownLabel).toBe("2");
    expect(advanceGameSession(session, 3_000).countdownLabel).toBe("1");
    expect(advanceGameSession(session, 4_000).countdownLabel).toBe("start");
  });

  it("enters playing once after the countdown completes", () => {
    const session = startGameSession(createInitialGameSession(), 1_000);
    const playing = advanceGameSession(session, 5_000);
    const stillPlaying = advanceGameSession(playing, 5_100);

    expect(playing.state).toBe("playing");
    expect(playing.justStartedPlaying).toBe(true);
    expect(stillPlaying.state).toBe("playing");
    expect(stillPlaying.justStartedPlaying).toBe(false);
  });

  it("moves to result exactly at the 60 second playing duration", () => {
    const session = advanceGameSession(
      startGameSession(createInitialGameSession(), 0),
      4_000
    );
    const almostDone = advanceGameSession(session, 63_999);
    const result = advanceGameSession(session, 64_000);

    expect(almostDone.state).toBe("playing");
    expect(almostDone.timeRemainingMs).toBe(1);
    expect(result.state).toBe("result");
    expect(result.timeRemainingMs).toBe(0);
    expect(result.resultEntered).toBe(true);
  });

  it("does not restart countdown on duplicate start", () => {
    const session = startGameSession(createInitialGameSession(), 1_000);
    const duplicate = startGameSession(session, 2_000);

    expect(duplicate).toEqual(session);
  });

  it("retry clears back to a fresh countdown", () => {
    const result = advanceGameSession(
      advanceGameSession(startGameSession(createInitialGameSession(), 0), 4_000),
      64_000
    );

    const retried = retryGameSession(result, 80_000);

    expect(retried.state).toBe("countdown");
    expect(retried.countdownLabel).toBe("3");
    expect(retried.timeRemainingMs).toBe(60_000);
  });
});
