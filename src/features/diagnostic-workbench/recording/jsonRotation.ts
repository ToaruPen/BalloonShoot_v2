const TELEMETRY_JSON_PATTERN = /^telemetry-.*\.json$/;

export const telemetryJsonFilesToDelete = (
  names: readonly string[],
  capacity: number
): string[] =>
  names
    .filter((name) => TELEMETRY_JSON_PATTERN.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(Math.max(0, capacity));
