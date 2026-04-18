import { escapeHTML } from "../../shared/browser/escapeHTML";

export const formatScalar = (value: number): string => value.toFixed(3);

export const formatScalarOrUnavailable = (
  value: number | undefined
): string => (value === undefined ? "unavailable" : formatScalar(value));

export const renderDiagnosticValue = (label: string, value: string): string => `
  <div class="wb-diagnostic-value">
    <span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong>
  </div>
`;
