export type BalloonSize = "normal" | "small";

export interface Balloon {
  id: string;
  x: number;
  y: number;
  radius: number;
  vy: number;
  size: BalloonSize;
  alive: boolean;
}
