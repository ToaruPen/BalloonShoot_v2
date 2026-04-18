import { escapeHTML } from "../shared/browser/escapeHTML";
import type { CountdownLabel } from "../features/gameplay/domain/gameSession";

interface GameHudResult {
  readonly finalScore: number;
  readonly bestCombo: number;
}

interface GameHudViewModel {
  readonly score: number;
  readonly combo: number;
  readonly multiplier: number;
  readonly timeRemainingMs: number;
  readonly countdownLabel: CountdownLabel | undefined;
  readonly statusMessage: string | undefined;
  readonly result: GameHudResult | undefined;
}

const renderHudItem = (label: string, value: string): string => `
  <div class="hud-item">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>
`;

const secondsRemaining = (timeRemainingMs: number): number =>
  Math.ceil(Math.max(0, timeRemainingMs) / 1_000);

export const renderGameHud = ({
  score,
  combo,
  multiplier,
  timeRemainingMs,
  countdownLabel,
  statusMessage,
  result
}: GameHudViewModel): string => {
  const status =
    statusMessage === undefined
      ? ""
      : `<p class="hud-status">${escapeHTML(statusMessage)}</p>`;
  const countdown =
    countdownLabel === undefined
      ? ""
      : `<div class="countdown" data-game-countdown="${countdownLabel}">${countdownLabel === "start" ? "スタート" : countdownLabel}</div>`;
  const resultHtml =
    result === undefined
      ? ""
      : `
        <section class="result-panel" aria-label="結果">
          <h2>結果</h2>
          <div class="result-grid">
            ${renderHudItem("最終スコア", String(result.finalScore))}
            ${renderHudItem("最大コンボ", String(result.bestCombo))}
          </div>
          <button class="screen-button" data-game-action="retry">もう一度</button>
        </section>
      `;

  return `
    <div class="hud" aria-label="ゲーム情報">
      ${renderHudItem("スコア", String(score))}
      ${renderHudItem("コンボ", String(combo))}
      ${renderHudItem("倍率", `x${String(multiplier)}`)}
      ${renderHudItem("残り", String(secondsRemaining(timeRemainingMs)))}
    </div>
    ${status}
    ${countdown}
    ${resultHtml}
  `;
};
