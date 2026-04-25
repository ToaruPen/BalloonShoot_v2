import type { Balloon } from "../gameplay/domain/balloon";
import {
  crosshairScaleForShot,
  type HitPopEffect,
  type TimedPointEffect
} from "./arcadeEffects";
import { arcadeCrosshair, arcadeEffects, arcadePalette } from "./arcadeTheme";
import type { BalloonSprites } from "./balloonSpriteUtils";

interface DrawState {
  balloons: Balloon[];
  crosshair?:
    | {
        x: number;
        y: number;
      }
    | undefined;
  shotEffect?: TimedPointEffect | undefined;
  hitEffects?: readonly HitPopEffect[] | undefined;
  balloonSprites?: BalloonSprites | undefined;
  frameNowMs?: number | undefined;
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

const stableIndexForId = (id: string, count: number): number => {
  if (count <= 0) {
    return 0;
  }

  let hash = 0;
  for (const char of id) {
    hash += char.charCodeAt(0);
  }

  return hash % count;
};

const selectBalloonSprite = (
  frames: readonly HTMLImageElement[] | undefined,
  balloon: Balloon
): HTMLImageElement | undefined => {
  if (frames === undefined || frames.length === 0) {
    return undefined;
  }

  if (balloon.size === "small") {
    return frames[Math.min(2, frames.length - 1)];
  }

  const normalVariantCount = Math.min(2, frames.length);
  return frames[stableIndexForId(balloon.id, normalVariantCount)];
};

const drawCrosshair = (
  ctx: CanvasRenderingContext2D,
  crosshair: { x: number; y: number },
  scale: number
): void => {
  ctx.save();
  ctx.translate(crosshair.x, crosshair.y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = arcadePalette.ink;
  ctx.lineWidth = arcadeCrosshair.outlineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, arcadeCrosshair.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = arcadePalette.cream;
  ctx.lineWidth = arcadeCrosshair.ringWidth;
  ctx.beginPath();
  ctx.arc(0, 0, arcadeCrosshair.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = arcadePalette.cream;
  ctx.lineWidth = arcadeCrosshair.lineWidth;
  ctx.beginPath();
  ctx.moveTo(-arcadeCrosshair.lineHalfLength, 0);
  ctx.lineTo(arcadeCrosshair.lineHalfLength, 0);
  ctx.moveTo(0, -arcadeCrosshair.lineHalfLength);
  ctx.lineTo(0, arcadeCrosshair.lineHalfLength);
  ctx.stroke();
  ctx.restore();
};

const drawHitEffects = (
  ctx: CanvasRenderingContext2D,
  effects: readonly HitPopEffect[],
  nowMs: number
): void => {
  const ringStartRadius = 20;
  const ringRadiusGrowth = 58;
  const shardLifetimeMs = 600;
  const shardGravity = 36;
  const shardWidth = 16;
  const shardHeight = 10;
  const scoreXOffset = 42;
  const scoreBaseYOffset = 82;
  const scoreRiseDelayMs = 100;
  const scoreRiseStepMs = 20;
  const scoreMaxRise = 24;

  for (const effect of effects) {
    const ageMs = Math.max(0, nowMs - effect.startedAtMs);
    const ringProgress = Math.min(1, ageMs / arcadeEffects.hitRingMs);
    const shardProgress = Math.min(1, ageMs / shardLifetimeMs);
    const scoreRise = Math.min(
      scoreMaxRise,
      Math.max(0, (ageMs - scoreRiseDelayMs) / scoreRiseStepMs)
    );

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - ageMs / arcadeEffects.hitLifetimeMs);
    ctx.strokeStyle = arcadePalette.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      effect.x,
      effect.y,
      ringStartRadius + ringProgress * ringRadiusGrowth,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    for (const shard of effect.shards) {
      const x = effect.x + shard.dx * shardProgress;
      const y =
        effect.y +
        shard.dy * shardProgress +
        shardGravity * shardProgress * shardProgress;
      ctx.fillStyle = shard.color;
      ctx.strokeStyle = arcadePalette.ink;
      ctx.lineWidth = 3;
      ctx.fillRect(
        x - shardWidth / 2,
        y - shardHeight / 2,
        shardWidth,
        shardHeight
      );
      ctx.strokeRect(
        x - shardWidth / 2,
        y - shardHeight / 2,
        shardWidth,
        shardHeight
      );
    }

    ctx.font = "bold 24px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = arcadePalette.cream;
    ctx.strokeStyle = arcadePalette.ink;
    ctx.lineWidth = 4;
    ctx.strokeText(
      effect.scoreLabel,
      effect.x + scoreXOffset,
      effect.y - scoreBaseYOffset - scoreRise
    );
    ctx.fillText(
      effect.scoreLabel,
      effect.x + scoreXOffset,
      effect.y - scoreBaseYOffset - scoreRise
    );
    ctx.restore();
  }
};

export const drawGameFrame = (
  ctx: CanvasRenderingContext2D,
  state: DrawState
): void => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const frames = state.balloonSprites?.frames;

  for (const balloon of state.balloons) {
    if (!balloon.alive) {
      continue;
    }

    const sprite = selectBalloonSprite(frames, balloon);
    if (sprite !== undefined) {
      drawBalloonSprite(ctx, balloon, sprite);
    } else {
      drawBalloonFallback(ctx, balloon);
    }
  }

  const frameNowMs = state.frameNowMs ?? 0;
  drawHitEffects(ctx, state.hitEffects ?? [], frameNowMs);

  if (!state.crosshair) {
    return;
  }

  drawCrosshair(
    ctx,
    state.crosshair,
    crosshairScaleForShot(state.shotEffect, frameNowMs)
  );
};
