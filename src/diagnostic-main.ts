import "./styles/diagnostic.css";
import {
  createDiagnosticWorkbench,
  type DiagnosticWorkbench
} from "./features/diagnostic-workbench/DiagnosticWorkbench";
import { renderWorkbenchHTML } from "./features/diagnostic-workbench/renderWorkbench";

const root = document.querySelector<HTMLDivElement>("#diagnostic-app");

if (!root) {
  throw new Error("Missing #diagnostic-app root");
}

const workbench: DiagnosticWorkbench = createDiagnosticWorkbench();

const render = (): void => {
  const state = workbench.getState();
  root.innerHTML = renderWorkbenchHTML(state);
  attachVideoStreams(state);
};

const attachVideoStreams = (
  state: ReturnType<DiagnosticWorkbench["getState"]>
): void => {
  if (state.screen !== "previewing") {
    return;
  }

  const frontVideo = document.querySelector<HTMLVideoElement>("#wb-front-video");
  const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");

  if (frontVideo !== null && state.frontStream !== undefined) {
    frontVideo.srcObject = state.frontStream.stream;
  }

  if (sideVideo !== null && state.sideStream !== undefined) {
    sideVideo.srcObject = state.sideStream.stream;
  }
};

const handleClick = (e: MouseEvent): void => {
  const target = e.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionEl = target.closest<HTMLElement>("[data-wb-action]");

  if (actionEl === null) {
    return;
  }

  const action = actionEl.dataset["wbAction"];
  const runAction = (actionPromise: Promise<void>): void => {
    void actionPromise.catch((error: unknown) => {
      console.error("Diagnostic workbench action failed", error);
    });
  };

  switch (action) {
    case "requestPermission":
      runAction(workbench.requestPermission());
      break;
    case "confirmDevices": {
      const frontSelect =
        document.querySelector<HTMLSelectElement>("#wb-front-select");
      const sideSelect =
        document.querySelector<HTMLSelectElement>("#wb-side-select");

      if (frontSelect === null || sideSelect === null) {
        return;
      }

      const frontId = frontSelect.value;
      const sideId = sideSelect.value;

      if (frontId === sideId) {
        alert("フロントとサイドには異なるカメラを選択してください。");
        return;
      }

      runAction(workbench.assignDevices(frontId, sideId));
      break;
    }
    case "swap":
      runAction(workbench.swapRoles());
      break;
    case "reselect":
      workbench.reselect();
      break;
  }
};

root.addEventListener("click", handleClick);
workbench.subscribe(render);

// Initial render
render();
