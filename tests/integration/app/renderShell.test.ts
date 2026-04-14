import { describe, expect, it } from "vitest";
import { renderShell } from "../../../src/app/screens/renderShell";
import type { AppState } from "../../../src/app/state/appState";

const createState = (overrides: Partial<AppState>): AppState => ({
  screen: "permission",
  countdown: 3,
  score: 0,
  combo: 0,
  multiplier: 1,
  ...overrides
});

describe("renderShell", () => {
  it("renders live camera and gameplay guidance copy", () => {
    const permissionHtml = renderShell(createState({ screen: "permission" }));
    const playingHtml = renderShell(createState({ screen: "playing" }));

    expect(permissionHtml).toContain("カメラを使ってバルーンを撃ちます。準備ボタンを押してください。");
    expect(playingHtml).toContain("手で銃の形を作って風船を撃とう！");
  });

  it("renders the ready screen start action", () => {
    const html = renderShell(createState({ screen: "ready" }));

    expect(html).toContain("スタート");
    expect(html).toContain('data-action="start"');
  });

  it("renders the countdown value and result retry action", () => {
    const countdownHtml = renderShell(createState({ screen: "countdown", countdown: 2 }));
    const resultHtml = renderShell(createState({ screen: "result", score: 18, multiplier: 2 }));

    expect(countdownHtml).toContain(">2<");
    expect(resultHtml).toContain("18");
    expect(resultHtml).toContain('data-action="retry"');
  });
});
