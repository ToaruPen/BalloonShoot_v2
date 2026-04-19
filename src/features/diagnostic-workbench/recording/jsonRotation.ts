const TELEMETRY_JSON_PATTERN =
  /^telemetry-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

export const telemetryJsonFilesToDelete = (
  names: readonly string[],
  capacity: number
): string[] =>
  names
    .filter((name) => TELEMETRY_JSON_PATTERN.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(Math.max(0, capacity));
