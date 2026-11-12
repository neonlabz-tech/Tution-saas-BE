import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(backendRoot, "..", "Tution-saas-FE");
const node = process.execPath;

function run(label, args, cwd) {
  const child = spawn(node, args, { cwd, stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    if (code) console.error(`${label} stopped with code ${code ?? "unknown"}`);
  });
  return child;
}

console.log("Website: http://127.0.0.1:5173/#/dashboard/notices");
console.log("API:     http://127.0.0.1:4000");

const api = run("API", [
  path.join(backendRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js"),
  "start",
  "--watch",
  "--env-file",
  ".env",
], backendRoot);

const web = run("Website", [
  path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js"),
], frontendRoot);

function stop() {
  if (!api.killed) api.kill();
  if (!web.killed) web.kill();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
