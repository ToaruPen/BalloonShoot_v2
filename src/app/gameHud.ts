import { escapeHTML } from "../shared/browser/escapeHTML";
import type { CountdownLabel } from "../features/gameplay/domain/gameSession";

interface GameHudResult {
  readonly finalScore: number;
  readonly bestCombo: number;
  readonly starCount: 1 | 2 | 3;
}

interface GameHudStatusAction {
  readonly action: "reselectCameras";
  readonly label: string;
}

interface GameHudViewModel {
  readonly score: number;
  readonly combo: number;
  readonly multiplier: number;
  readonly timeRemainingMs: number;
  readonly countdownLabel: CountdownLabel | undefined;
  readonly statusMessage: string | undefined;
  readonly statusAction?: GameHudStatusAction | undefined;
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

export const resultStarCountForScore = (score: number): 1 | 2 | 3 => {
  if (score >= 30) {
    return 3;
  }

  if (score >= 10) {
    return 2;
  }

  return 1;
};

const renderResultStars = (starCount: 1 | 2 | 3): string =>
  Array.from(
    { length: starCount },
    () =>
      '<img src="/images/arcade/ui/star-badge.png" alt="" aria-hidden="true">'
  ).join("");

export const renderGameHud = ({
  score,
  combo,
  multiplier,
  timeRemainingMs,
  countdownLabel,
  statusMessage,
  statusAction,
  result
}: GameHudViewModel): string => {
  const statusActionHtml =
    statusAction === undefined
      ? ""
      : `<button class="screen-button hud-status-action" data-game-action="${escapeHTML(statusAction.action)}">${escapeHTML(statusAction.label)}</button>`;
  const status =
    statusMessage === undefined
      ? ""
      : `<div class="hud-status-row"><p class="hud-status">${escapeHTML(statusMessage)}</p>${statusActionHtml}</div>`;
  const countdown =
    countdownLabel === undefined
      ? ""
      : `<div class="countdown" data-game-countdown="${countdownLabel}">${countdownLabel === "start" ? "スタート" : countdownLabel}</div>`;
  const resultHtml =
    result === undefined
      ? ""
      : `
        <section class="result-panel result-panel-arcade" aria-label="結果">
          <p class="result-kicker">RESULT</p>
          <h2>ナイスシュート</h2>
          <div class="result-score">
            <span>スコア</span>
            <strong>${String(result.finalScore)}</strong>
          </div>
          <div class="result-stars" aria-label="スター評価">
            ${renderResultStars(result.starCount)}
          </div>
          <div class="result-grid">
            ${renderHudItem("最大コンボ", String(result.bestCombo))}
          </div>
          <button class="screen-button result-retry-button" data-game-action="retry">もういっかい</button>
        </section>
      `;

  return `
    <div class="hud hud-arcade" aria-label="ゲーム情報">
      <div class="hud-score-badge">
        <span>スコア</span>
        <strong>${String(score)}</strong>
      </div>
      <div class="hud-timer-disc">
        <span>残り</span>
        <strong>${String(secondsRemaining(timeRemainingMs))}</strong>
      </div>
      <div class="hud-combo-chip">
        <span>コンボ</span>
        <strong>${String(combo)}</strong>
      </div>
      <div class="hud-multiplier-chip">
        <span>倍率</span>
        <strong>x${String(multiplier)}</strong>
      </div>
    </div>
    ${status}
    ${countdown}
    ${resultHtml}
  `;
};
