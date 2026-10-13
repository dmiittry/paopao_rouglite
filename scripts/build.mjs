import { mkdir, cp, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });
await copyFile("index.html", "dist/index.html");
console.log("Static build ready: dist/ (no dependencies)");
