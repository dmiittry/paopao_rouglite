import { Game } from "../src/core/Game.js";
import { SaveManager } from "../src/core/SaveManager.js";
export class MemoryStorage {
  constructor() {
    this.data = new Map();
  }
  getItem(k) {
    return this.data.get(k) || null;
  }
  setItem(k, v) {
    this.data.set(k, v);
  }
}
export function game(seed = "TEST", booster = "green") {
  const storage = new MemoryStorage(),
    g = new Game(new SaveManager(storage));
  must(g, "newRun", { seed });
  g.state.boosterChoices = [booster];
  must(g, "chooseBooster", { id: booster });
  must(g, "beginStage");
  return g;
}
export function must(g, action, args = {}) {
  const r = g.transact(action, args);
  if (!r.ok) throw Error(`${action}: ${r.error}`);
  return r;
}
export function card(rank, suit = "hearts", extra = {}) {
  return {
    rank,
    suit,
    instanceId: `${rank}-${suit}`,
    turnsUsed: 0,
    modifiers: [],
    ...extra,
  };
}
export function addJoker(g, id) {
  g.state.jokers.push({ id, uid: `j:${id}`, count: 0 });
}
