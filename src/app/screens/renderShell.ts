import type { AppState } from "../state/appState";

const renderScreenBody = (state: AppState): string => {
  switch (state.screen) {
    case "permission":
      return `
        <p class="screen-title">カメラ準備</p>
        <p class="screen-copy">カメラを使ってバルーンを撃ちます。準備ボタンを押してください。</p>
        <button class="screen-button" data-action="camera">カメラを準備</button>
      `;
    case "ready":
      return `
        <p class="screen-title">準備OK</p>
        <p class="screen-copy">1分間のバルーンシュートを開始します。</p>
        <button class="screen-button" data-action="start">スタート</button>
      `;
    case "countdown":
      return `
        <p class="screen-title">カウントダウン</p>
        <p class="countdown">${String(state.countdown)}</p>
      `;
    case "playing":
      return `
        <p class="screen-title">プレイ中</p>
        <p class="screen-copy">手で銃の形を作って風船を撃とう！</p>
      `;
    case "result":
      return `
        <p class="screen-title">けっか</p>
        <p class="screen-copy">スコア: <strong>${String(state.score)}</strong></p>
        <button class="screen-button" data-action="retry">もういちど</button>
      `;
  }
};

export const renderShell = (state: AppState): string => `
  <section class="overlay">
    <header class="hud" aria-label="score hud">
      <span>Score: ${String(state.score)}</span>
      <span>Combo: ${String(state.combo)}</span>
      <span>x${String(state.multiplier)}</span>
    </header>
    <div class="screen screen-${state.screen}">
      ${renderScreenBody(state)}
    </div>
  </section>
`;
