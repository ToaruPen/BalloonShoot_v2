import "./styles/app.css";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTrackerOptions
} from "./features/hand-tracking/createMediaPipeHandTracker";
import { startApp, type StartAppDebugHooks } from "./app/bootstrap/startApp";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

const debugHooks = import.meta.env.DEV
  ? {
      createHandTracker: (options: MediaPipeHandTrackerOptions) => {
        const testHooks = (
          window as Window & {
            __balloonShootTestHooks?: StartAppDebugHooks;
          }
        ).__balloonShootTestHooks;
        const createHandTracker = testHooks?.createHandTracker;

        return (
          createHandTracker?.(options) ??
          createMediaPipeHandTracker(options)
        );
      }
    }
  : undefined;

startApp(appRoot, undefined, debugHooks);
