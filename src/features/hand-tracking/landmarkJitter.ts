export interface LandmarkJitterTracker {
  push(x: number, y: number): void;
  peek(): number;
  reset(): void;
}

interface Sample {
  x: number;
  y: number;
}

export const createLandmarkJitterTracker = (
  windowSize: number
): LandmarkJitterTracker => {
  const capacity = Math.max(2, Math.floor(windowSize));
  const samples: Sample[] = [];

  const push = (x: number, y: number): void => {
    samples.push({ x, y });

    if (samples.length > capacity) {
      samples.shift();
    }
  };

  const peek = (): number => {
    if (samples.length < 2) {
      return 0;
    }

    let peak = 0;
    let prev: Sample | undefined;

    for (const curr of samples) {
      if (prev === undefined) {
        prev = curr;
        continue;
      }

      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > peak) {
        peak = distance;
      }

      prev = curr;
    }

    return peak;
  };

  const reset = (): void => {
    samples.length = 0;
  };

  return { push, peek, reset };
};
