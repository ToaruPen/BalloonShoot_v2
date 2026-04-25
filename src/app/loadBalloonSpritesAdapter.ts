import type { BalloonSprites } from "../features/rendering/balloonSpriteUtils";

const FRAME_PATHS = [
  "/images/balloons/arcade/normal-candy.png",
  "/images/balloons/arcade/normal-mint.png",
  "/images/balloons/arcade/small-alert.png"
] as const;

const loadImage = (path: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener(
      "load",
      () => {
        resolve(image);
      },
      { once: true }
    );
    image.addEventListener(
      "error",
      () => {
        reject(new Error(`Failed to load balloon sprite: ${path}`));
      },
      { once: true }
    );
    image.src = path;
  });

export const loadBalloonSprites = async (): Promise<BalloonSprites> => {
  const frames = await Promise.all(FRAME_PATHS.map(loadImage));
  return { frames };
};
