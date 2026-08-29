// Runs `pnpm tauri dev` with RUST_LOG set, from any shell.
//
// Usage: pnpm dev:logged [filter]
// The optional argument is a RUST_LOG filter, e.g. `ltk_overlay=debug`.
import { spawn } from "node:child_process";

const filter = process.argv[2] ?? "ltk_manager=trace,ltk_overlay=debug,tauri=info";
console.log(`RUST_LOG=${filter}`);

const child = spawn("pnpm", ["tauri", "dev"], {
  stdio: "inherit",
  env: { ...process.env, RUST_LOG: filter },
  // pnpm is pnpm.cmd on Windows, which only a shell resolves.
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
