import { CONFIG } from "../config.js";
export function moveBoard(board, mode, cols = CONFIG.cols, rows = CONFIG.rows) {
  const result = [...board],
    line = (indices, towardEnd = false) => {
      const cards = indices.map((i) => result[i]).filter(Boolean);
      const empty = Array(indices.length - cards.length).fill(null),
        values = towardEnd ? [...empty, ...cards] : [...cards, ...empty];
      indices.forEach((p, i) => (result[p] = values[i]));
    };
  const row = (y, x0 = 0, x1 = cols) =>
      Array.from({ length: x1 - x0 }, (_, i) => y * cols + x0 + i),
    col = (x, y0 = 0, y1 = rows) =>
      Array.from({ length: y1 - y0 }, (_, i) => (y0 + i) * cols + x);
  const mx = Math.ceil(cols / 2),
    my = Math.ceil(rows / 2);
  if (mode === "static") return result;
  if (["down", "up", "columns"].includes(mode))
    for (let x = 0; x < cols; x++)
      line(col(x), mode === "down" || (mode === "columns" && x % 2 === 0));
  else if (["left", "right", "rows"].includes(mode))
    for (let y = 0; y < rows; y++)
      line(row(y), mode === "right" || (mode === "rows" && y % 2 === 0));
  else if (["out", "in"].includes(mode))
    for (let y = 0; y < rows; y++) {
      line(row(y, 0, mx), mode === "in");
      line(row(y, mx), mode === "out");
    }
  else if (["clockwise", "counter"].includes(mode)) {
    const ring = [
        ...row(0),
        ...col(cols - 1, 1, rows),
        ...row(rows - 1, 0, cols - 1).reverse(),
        ...col(0, 1, rows - 1).reverse(),
      ],
      values = ring.map((p) => result[p]),
      shift = mode === "clockwise" ? 1 : -1;
    ring.forEach(
      (p, i) => (result[p] = values[(i - shift + ring.length) % ring.length]),
    );
  } else if (["quadOut", "quadIn"].includes(mode)) {
    for (let y = 0; y < rows; y++) {
      line(row(y, 0, mx), mode === "quadIn");
      line(row(y, mx), mode === "quadOut");
    }
    for (let x = 0; x < cols; x++) {
      line(col(x, 0, my), mode === "quadIn");
      line(col(x, my), mode === "quadOut");
    }
  } else if (
    ["snakeStart", "snakeEnd", "topLeft", "bottomRight"].includes(mode)
  ) {
    const order = Array.from({ length: rows }, (_, y) =>
      ["snakeStart", "snakeEnd"].includes(mode) && y % 2
        ? row(y).reverse()
        : row(y),
    ).flat();
    line(order, mode === "snakeEnd" || mode === "bottomRight");
  } else if (["mirrorX", "mirrorY", "rotate"].includes(mode))
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const nx = mode === "mirrorY" ? x : cols - 1 - x,
          ny = mode === "mirrorX" ? y : rows - 1 - y;
        result[ny * cols + nx] = board[y * cols + x];
      }
  else throw Error(`Неизвестное движение: ${mode}`);
  return result;
}
