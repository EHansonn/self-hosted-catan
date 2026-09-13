import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_OPTIONS, type ResumeRoomView } from "../shared/game";

const url = "http://127.0.0.1:18342";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("empty started games close after a restart-safe grace period", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "crossroads-empty-room-test-"));
  let serverProcess: ChildProcess | undefined;
  let socket: Socket | undefined;
  let logs = "";

  const startServer = async () => {
    serverProcess = spawn(globalThis.process.execPath, ["dist/node/server.cjs"], {
      env: {
        ...globalThis.process.env,
        PORT: "18342",
        HOST: "127.0.0.1",
        DATA_DIR: dataDir,
        ROOM_CREATE_PASSWORD: "test-only-empty-room-key",
        EMPTY_GAME_GRACE_MS: "1000",
        CLEANUP_INTERVAL_MS: "100",
        BOT_INTERVAL_MS: "50",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess.stdout?.on("data", (chunk) => (logs += chunk));
    serverProcess.stderr?.on("data", (chunk) => (logs += chunk));
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        if ((await fetch(url + "/api/health")).ok) return;
      } catch {}
      if (serverProcess.exitCode !== null) throw new Error(logs);
      await delay(25);
    }
    throw new Error("Server did not start: " + logs);
  };
  const stopServer = async () => {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    const stopped = new Promise<void>((resolve) =>
      serverProcess!.once("exit", () => resolve()),
    );
    serverProcess.kill("SIGTERM");
    await stopped;
  };
  const connect = async (cookie: string) => {
    socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });
    let resumable: ResumeRoomView[] = [];
    socket.on("resume-options", (rooms) => (resumable = rooms));
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("connect_error", reject);
    });
    const command = (value: unknown) =>
      new Promise<{ ok: boolean }>((resolve, reject) =>
        socket!.timeout(3000).emit(
          "command",
          value,
          (error: Error | null, result: { ok: boolean }) =>
            error ? reject(error) : resolve(result),
        ),
      );
    await command({ type: "sync" });
    return {
      command,
      get resumable() {
        return resumable;
      },
    };
  };

  try {
    await startServer();
    const sessionResponse = await fetch(url + "/api/session");
    const cookie = sessionResponse.headers.get("set-cookie")!.split(";")[0];
    let client = await connect(cookie);
    assert.ok(
      (
        await client.command({
          type: "create",
          name: "Human",
          password: "test-only-empty-room-key",
          options: { ...DEFAULT_OPTIONS, seats: 2 },
        })
      ).ok,
    );
    assert.ok((await client.command({ type: "bot" })).ok);
    assert.ok((await client.command({ type: "start" })).ok);
    assert.ok((await client.command({ type: "home" })).ok);
    await delay(350);
    const firstCode = client.resumable[0].code;
    assert.ok(
      (
        await client.command({
          type: "resume",
          code: firstCode,
        })
      ).ok,
    );
    await delay(800);
    assert.ok((await client.command({ type: "home" })).ok);
    assert.equal(client.resumable[0].code, firstCode);
    await delay(1_200);
    assert.deepEqual(client.resumable, []);

    assert.ok(
      (
        await client.command({
          type: "create",
          name: "Human",
          password: "test-only-empty-room-key",
          options: { ...DEFAULT_OPTIONS, seats: 2 },
        })
      ).ok,
    );
    assert.ok((await client.command({ type: "bot" })).ok);
    assert.ok((await client.command({ type: "start" })).ok);
    assert.ok((await client.command({ type: "home" })).ok);
    await delay(350);
    socket!.close();
    await stopServer();
    await startServer();
    client = await connect(cookie);
    assert.equal(client.resumable.length, 1);
    await delay(850);
    assert.deepEqual(client.resumable, []);
  } finally {
    socket?.close();
    await stopServer();
  }
});
