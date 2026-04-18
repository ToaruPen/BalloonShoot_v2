import "./styles/app.css";
import { createFrontAimGamePage } from "./app/frontAimGamePage";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Missing #app root.");
}

const gamePage = createFrontAimGamePage();
gamePage.mount(root);

window.addEventListener("beforeunload", () => {
  gamePage.destroy();
});
