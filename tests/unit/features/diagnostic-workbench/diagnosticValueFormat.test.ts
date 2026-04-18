import { describe, expect, it } from "vitest";
import {
  formatScalar,
  formatScalarOrUnavailable,
  renderDiagnosticValue
} from "../../../../src/features/diagnostic-workbench/diagnosticValueFormat";

describe("diagnostic value formatting", () => {
  it("formats scalars to three decimals and missing values as unavailable", () => {
    expect(formatScalar(1.23456)).toBe("1.235");
    expect(formatScalarOrUnavailable(undefined)).toBe("unavailable");
    expect(formatScalarOrUnavailable(0.5)).toBe("0.500");
  });

  it("escapes labels and values", () => {
    const html = renderDiagnosticValue(
      `label <>&"'`,
      `value <>&"'`
    );

    expect(html).toContain("label &lt;&gt;&amp;&quot;&#39;");
    expect(html).toContain("value &lt;&gt;&amp;&quot;&#39;");
    expect(html).not.toContain(`label <>&"'`);
    expect(html).not.toContain(`value <>&"'`);
  });
});
