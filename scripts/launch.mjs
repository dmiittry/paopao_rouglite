import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const node = process.execPath;
async function probe(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(500),
    });
    return (await response.text()).includes("Лабиринт Джокера · Card Connect")
      ? "game"
      : "occupied";
  } catch {
    return "free";
  }
}
const firstPort = Number(process.env.PAO_PORT || 4173);
if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65524)
  throw Error("Некорректный PAO_PORT");
let port = firstPort;
for (; port < firstPort + 11; port++) {
  const status = await probe(port);
  if (status === "game") break;
  if (status === "free") {
    const child = spawn(
      node,
      [
        "scripts/serve.mjs",
        ...(process.argv.includes("--dist") ? ["--dist"] : []),
      ],
      {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if ((await probe(port)) === "game") {
        ready = true;
        break;
      }
    }
    if (ready) break;
  }
}
if (port === firstPort + 11)
  throw Error(
    "Не удалось запустить локальный сервер. Проверьте порты 4173–4183.",
  );
const url = `http://127.0.0.1:${port}`;
const command =
  process.platform === "win32"
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
if (!process.argv.includes("--no-open")) {
  spawn(command[0], command[1], {
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  }).unref();
}
console.log(`Игра запущена: ${url}`);
