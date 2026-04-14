import type { Balloon } from "../gameplay/domain/balloon";

interface DrawState {
  balloons: Balloon[];
  crosshair?: {
    x: number;
    y: number;
  };
}

export const drawGameFrame = (ctx: CanvasRenderingContext2D, state: DrawState): void => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const balloon of state.balloons) {
    if (!balloon.alive) {
      continue;
    }

    ctx.beginPath();
    ctx.fillStyle = balloon.size === "small" ? "#ff8a80" : "#4fc3f7";
    ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!state.crosshair) {
    return;
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(state.crosshair.x, state.crosshair.y, 24, 0, Math.PI * 2);
  ctx.moveTo(state.crosshair.x - 32, state.crosshair.y);
  ctx.lineTo(state.crosshair.x + 32, state.crosshair.y);
  ctx.moveTo(state.crosshair.x, state.crosshair.y - 32);
  ctx.lineTo(state.crosshair.x, state.crosshair.y + 32);
  ctx.stroke();
};
