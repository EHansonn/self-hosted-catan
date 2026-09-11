import { spawn } from "node:child_process";
const children = ["dev:server", "dev:web"].map((script) =>
  spawn("npm", ["run", script], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(script === "dev:server"
        ? { ALLOWED_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173" }
        : {}),
    },
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => children.forEach((child) => child.kill(signal)));
children.forEach((child) =>
  child.on("exit", (code) => {
    if (code) {
      children.forEach((other) => other.kill());
      process.exitCode = code;
    }
  }),
);
