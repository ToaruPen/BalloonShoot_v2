export const CAMERA_RECONNECT_COOLDOWN_MS = 1_000;
export const MAX_CAMERA_RECONNECT_ATTEMPTS = 3;

interface FailureEntry {
  readonly count: number;
  readonly lastFailureMs: number;
}

interface ReconnectBudget {
  canAttempt(key: string, nowMs: number): boolean;
  recordFailure(key: string, nowMs: number): void;
  recordSuccess(key: string): void;
}

export const createReconnectBudget = (): ReconnectBudget => {
  const failures = new Map<string, FailureEntry>();

  const entryFresh = (entry: FailureEntry, nowMs: number): boolean =>
    nowMs - entry.lastFailureMs <= CAMERA_RECONNECT_COOLDOWN_MS;

  return {
    canAttempt(key, nowMs) {
      const entry = failures.get(key);

      if (entry === undefined || !entryFresh(entry, nowMs)) {
        return true;
      }

      return entry.count < MAX_CAMERA_RECONNECT_ATTEMPTS;
    },
    recordFailure(key, nowMs) {
      const previous = failures.get(key);
      const count =
        previous !== undefined && entryFresh(previous, nowMs)
          ? previous.count + 1
          : 1;

      failures.set(key, { count, lastFailureMs: nowMs });
    },
    recordSuccess(key) {
      failures.delete(key);
    }
  };
};
