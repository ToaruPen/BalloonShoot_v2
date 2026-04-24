import type { BalloonSprites } from "../features/rendering/balloonSpriteUtils";

const FRAME_PATHS = [
  "/images/balloons/rising/0.png",
  "/images/balloons/rising/1.png",
  "/images/balloons/rising/2.png",
  "/images/balloons/rising/3.png",
  "/images/balloons/rising/4.png"
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
