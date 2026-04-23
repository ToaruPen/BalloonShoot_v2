import type { Balloon } from "../gameplay/domain/balloon";
import type { BalloonSprites } from "./loadBalloonSprites";

interface DrawState {
  balloons: Balloon[];
  crosshair?:
    | {
        x: number;
        y: number;
      }
    | undefined;
  shotEffect?:
    | {
        x: number;
        y: number;
      }
    | undefined;
  hitEffect?:
    | {
        x: number;
        y: number;
      }
    | undefined;
  balloonSprites?: BalloonSprites | undefined;
  balloonFrameIndex?: number | undefined;
}

const drawBalloonSprite = (
  ctx: CanvasRenderingContext2D,
  balloon: Balloon,
  sprite: HTMLImageElement
): void => {
  const aspect =
    sprite.naturalHeight > 0 && sprite.naturalWidth > 0
      ? sprite.naturalWidth / sprite.naturalHeight
      : 0.5;
  const drawHeight = balloon.radius * 2.6;
  const drawWidth = drawHeight * aspect;
  ctx.drawImage(
    sprite,
    balloon.x - drawWidth / 2,
    balloon.y - drawHeight / 2,
    drawWidth,
    drawHeight
  );
};

const drawBalloonFallback = (
  ctx: CanvasRenderingContext2D,
  balloon: Balloon
): void => {
  ctx.beginPath();
  ctx.fillStyle = balloon.size === "small" ? "#ff8a80" : "#4fc3f7";
  ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
  ctx.fill();
};

export const drawGameFrame = (
  ctx: CanvasRenderingContext2D,
  state: DrawState
): void => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const frames = state.balloonSprites?.frames;
  const frameIndex = state.balloonFrameIndex ?? 0;
  const sprite =
    frames !== undefined && frames.length > 0
      ? frames[frameIndex % frames.length]
      : undefined;

  for (const balloon of state.balloons) {
    if (!balloon.alive) {
      continue;
    }

    if (sprite !== undefined) {
      drawBalloonSprite(ctx, balloon, sprite);
    } else {
      drawBalloonFallback(ctx, balloon);
    }
  }

  if (state.shotEffect !== undefined) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(state.shotEffect.x, state.shotEffect.y, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.hitEffect !== undefined) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(state.hitEffect.x, state.hitEffect.y, 34, 0, Math.PI * 2);
    ctx.stroke();
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
