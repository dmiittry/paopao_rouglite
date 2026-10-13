import { Game } from "./core/Game.js";
import { UIManager } from "./ui/UIManager.js";
const game = new Game();
game.debugEnabled = new URLSearchParams(location.search).get("debug") === "1";
const ui = new UIManager(game);
ui.render();
if (game.saveManager.error)
  ui.toast(`Сохранение не загружено: ${game.saveManager.error}`);
if (game.debugEnabled) window.labyrinth = { game, ui };
