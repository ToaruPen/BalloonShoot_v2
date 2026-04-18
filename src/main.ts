import "./styles/app.css";
import { createBalloonGamePage } from "./app/balloonGamePage";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Missing #app root.");
}

const gamePage = createBalloonGamePage();
gamePage.mount(root);

window.addEventListener("beforeunload", () => {
  gamePage.destroy();
});
