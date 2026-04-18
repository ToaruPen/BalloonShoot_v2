import { describe, expect, it } from "vitest";
import {
  CAMERA_RECONNECT_COOLDOWN_MS,
  MAX_CAMERA_RECONNECT_ATTEMPTS,
  createReconnectBudget
} from "../../../../src/features/camera/reconnectPolicy";

describe("createReconnectBudget", () => {
  it("blocks attempts after repeated failures within the cooldown window", () => {
    const budget = createReconnectBudget();

    expect(CAMERA_RECONNECT_COOLDOWN_MS).toBe(1_000);
    expect(MAX_CAMERA_RECONNECT_ATTEMPTS).toBe(3);

    expect(budget.canAttempt("frontAim", 1_000)).toBe(true);
    budget.recordFailure("frontAim", 1_000);
    budget.recordFailure("frontAim", 1_100);
    budget.recordFailure("frontAim", 1_200);

    expect(budget.canAttempt("frontAim", 1_300)).toBe(false);
    expect(budget.canAttempt("frontAim", 2_201)).toBe(true);
  });

  it("success clears the failure budget for that key only", () => {
    const budget = createReconnectBudget();

    budget.recordFailure("frontAim", 1_000);
    budget.recordFailure("frontAim", 1_100);
    budget.recordFailure("frontAim", 1_200);
    budget.recordFailure("sideTrigger", 1_000);
    budget.recordFailure("sideTrigger", 1_100);
    budget.recordFailure("sideTrigger", 1_200);
    budget.recordSuccess("frontAim");

    expect(budget.canAttempt("frontAim", 1_300)).toBe(true);
    expect(budget.canAttempt("sideTrigger", 1_300)).toBe(false);
  });
});
