import { CONFIG, identity } from "../config.js";
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
// BFS for each exact bend budget, in increasing order. The first result therefore
// minimizes turns, then distance. A padded grid makes outer routes ordinary cells.
export function findPath(
  board,
  start,
  end,
  maxTurns = 2,
  cols = CONFIG.cols,
  rows = CONFIG.rows,
  match = true,
) {
  if (
    start === end ||
    !board[start] ||
    !board[end] ||
    (match && identity(board[start]) !== identity(board[end]))
  )
    return null;
  const w = cols + 2,
    h = rows + 2,
    sx = (start % cols) + 1,
    sy = Math.floor(start / cols) + 1,
    ex = (end % cols) + 1,
    ey = Math.floor(end / cols) + 1;
  const open = (x, y) =>
    x >= 0 &&
    x < w &&
    y >= 0 &&
    y < h &&
    ((x === ex && y === ey) ||
      x === 0 ||
      y === 0 ||
      x === w - 1 ||
      y === h - 1 ||
      !board[(y - 1) * cols + x - 1]);
  for (let budget = 0; budget <= maxTurns; budget++) {
    const queue = [{ x: sx, y: sy, d: -1, t: 0, p: -1 }],
      seen = new Set();
    let head = 0;
    while (head < queue.length) {
      const qi = head++,
        q = queue[qi];
      for (let d = 0; d < 4; d++) {
        if (q.d >= 0 && d === (q.d + 2) % 4) continue;
        const t = q.t + (q.d >= 0 && q.d !== d ? 1 : 0);
        if (t > budget) continue;
        const x = q.x + DIRS[d][0],
          y = q.y + DIRS[d][1];
        if (!open(x, y) || (x === sx && y === sy)) continue;
        const key = `${x},${y},${d},${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const next = { x, y, d, t, p: qi };
        queue.push(next);
        if (x === ex && y === ey) {
          let n = queue.length - 1;
          const cells = [];
          while (n >= 0) {
            const v = queue[n];
            cells.push({ x: v.x - 1, y: v.y - 1 });
            n = v.p;
          }
          cells.reverse();
          const points = cells.filter(
            (c, i) =>
              i === 0 ||
              i === cells.length - 1 ||
              c.x - cells[i - 1].x !== cells[i + 1].x - c.x ||
              c.y - cells[i - 1].y !== cells[i + 1].y - c.y,
          );
          return {
            points,
            cells,
            turnsUsed: t,
            length: cells.length - 1,
            usedOuterBorder: cells.some(
              (c) => c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows,
            ),
          };
        }
      }
    }
  }
  return null;
}
export function availablePairs(
  board,
  maxTurns = 2,
  limit = Infinity,
  cols = CONFIG.cols,
  rows = CONFIG.rows,
) {
  const groups = new Map(),
    out = [];
  for (let i = 0; i < board.length; i++)
    if (board[i]) {
      const k = identity(board[i]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
  for (const group of groups.values())
    for (let a = 0; a < group.length; a++)
      for (let b = a + 1; b < group.length; b++) {
        const path = findPath(board, group[a], group[b], maxTurns, cols, rows);
        if (path) {
          out.push({ a: group[a], b: group[b], path });
          if (out.length >= limit) return out;
        }
      }
  return out;
}
