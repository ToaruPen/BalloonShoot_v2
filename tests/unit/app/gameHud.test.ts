import { describe, expect, it } from "vitest";
import { renderGameHud } from "../../../src/app/gameHud";

describe("renderGameHud", () => {
  it("renders score, combo, multiplier, timer, and countdown as key/value pairs", () => {
    const html = renderGameHud({
      score: 12,
      combo: 4,
      multiplier: 2,
      timeRemainingMs: 54_321,
      countdownLabel: "2",
      statusMessage: undefined,
      result: undefined
    });

    expect(html).toMatch(
      /<span[^>]*>スコア<\/span>\s*<strong[^>]*>12<\/strong>/
    );
    expect(html).toMatch(
      /<span[^>]*>コンボ<\/span>\s*<strong[^>]*>4<\/strong>/
    );
    expect(html).toMatch(/<span[^>]*>倍率<\/span>\s*<strong[^>]*>x2<\/strong>/);
    expect(html).toMatch(/<span[^>]*>残り<\/span>\s*<strong[^>]*>55<\/strong>/);
    expect(html).toContain('data-game-countdown="2"');
    expect(html).toContain('class="hud hud-arcade"');
    expect(html).toContain('class="hud-score-badge"');
    expect(html).toContain('class="hud-timer-disc"');
    expect(html).toContain('class="hud-combo-chip"');
    expect(html).toContain('class="hud-multiplier-chip"');
  });

  it("renders result summary and retry action", () => {
    const html = renderGameHud({
      score: 24,
      combo: 0,
      multiplier: 1,
      timeRemainingMs: 0,
      countdownLabel: undefined,
      statusMessage: undefined,
      result: { finalScore: 24, bestCombo: 6 }
    });

    expect(html).toContain("ナイスシュート");
    expect(html).toContain('class="result-score"');
    expect(html).toContain('class="result-stars"');
    expect(html).toContain('/images/arcade/ui/star-badge.png');
    expect(html).toContain("もういっかい");
    expect(html).not.toContain("🎈");
    expect(html).not.toContain("🎯");
    expect(html).toMatch(/<span[^>]*>スコア<\/span>\s*<strong[^>]*>24<\/strong>/);
    expect(html).toMatch(
      /<span[^>]*>最大コンボ<\/span>\s*<strong[^>]*>6<\/strong>/
    );
    expect(html).toContain('data-game-action="retry"');
  });

  it("escapes status text and omits diagnostic labels", () => {
    const html = renderGameHud({
      score: 0,
      combo: 0,
      multiplier: 1,
      timeRemainingMs: 60_000,
      countdownLabel: undefined,
      statusMessage: `入力 <準備> & "確認" '中'`,
      result: undefined
    });

    expect(html).toContain(
      "入力 &lt;準備&gt; &amp; &quot;確認&quot; &#39;中&#39;"
    );
    expect(html).not.toContain("fusionMode");
    expect(html).not.toContain("fusionRejectReason");
    expect(html).not.toContain("threshold");
    expect(html).not.toContain("unavailable");
  });

  it("renders a production reselect action for capture-lost status", () => {
    const html = renderGameHud({
      score: 0,
      combo: 0,
      multiplier: 1,
      timeRemainingMs: 60_000,
      countdownLabel: undefined,
      statusMessage: "カメラが切断されました",
      statusAction: {
        action: "reselectCameras",
        label: "カメラを選び直す"
      },
      result: undefined
    });

    expect(html).toContain("カメラが切断されました");
    expect(html).toContain("カメラを選び直す");
    expect(html).toContain('data-game-action="reselectCameras"');
    expect(html).not.toContain("captureLost");
    expect(html).not.toContain("laneFailed");
  });
});
