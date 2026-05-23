import { mkdir, cp } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "desktop", "renderer");
const target = path.join(root, "dist", "desktop", "renderer");
const preloadSource = path.join(root, "src", "desktop", "preload.cjs");
const preloadTarget = path.join(root, "dist", "desktop", "preload.cjs");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await cp(preloadSource, preloadTarget);
