import { CONFIG } from "../config.js";
import { makeTiles } from "../cards/CardCollection.js";
import { availablePairs, findPath } from "./PathFinder.js";
export function shuffleBoard(board, rng, maxTurns = 2) {
  const slots = board.flatMap((t, i) => (t ? [i] : [])),
    tiles = board.filter(Boolean);
  if (tiles.length < 2) return [...board];
  let result;
  for (let tries = 0; tries < 16; tries++) {
    const shuffled = rng.shuffle(tiles);
    result = board.map(() => null);
    slots.forEach((p, i) => (result[p] = shuffled[i]));
    if (availablePairs(result, maxTurns, 1).length) return result;
  }
  // Place an existing identical pair in two geometrically connectable occupied cells.
  // Their occupied geometry is unchanged, so this works even for a one-turn boss.
  let source;
  for (let i = 0; i < tiles.length && !source; i++)
    for (let j = i + 1; j < tiles.length; j++)
      if (tiles[i].rank === tiles[j].rank && tiles[i].suit === tiles[j].suit) {
        source = [tiles[i], tiles[j]];
        break;
      }
  if (!source) throw Error("Нарушена чётность пар");
  for (let a = 0; a < slots.length; a++)
    for (let b = a + 1; b < slots.length; b++)
      if (
        findPath(
          result,
          slots[a],
          slots[b],
          maxTurns,
          CONFIG.cols,
          CONFIG.rows,
          false,
        )
      ) {
        for (let k = 0; k < 2; k++) {
          const dst = k === 0 ? slots[a] : slots[b],
            src = result.findIndex((t) => t?.id === source[k].id);
          [result[dst], result[src]] = [result[src], result[dst]];
        }
        return result;
      }
  throw Error("Нет геометрически доступных клеток");
}
export function generateBoard(deck, rng, maxTurns = 2) {
  if (deck.length !== 52) throw Error("Колода должна содержать 52 пары");
  return shuffleBoard(makeTiles(deck), rng, maxTurns);
}
export function ensureMove(board, rng, maxTurns) {
  return board.filter(Boolean).length > 1 &&
    !availablePairs(board, maxTurns, 1).length
    ? { board: shuffleBoard(board, rng, maxTurns), shuffled: true }
    : { board, shuffled: false };
}
