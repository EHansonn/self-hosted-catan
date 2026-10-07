import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import { DEFAULT_OPTIONS, type RoomView } from "../shared/game";
import { type SignedReplay } from "../shared/replay";
import { verifyReplay } from "../server/replay";

test("a live completed game offers a signed replay that its server can import", { timeout: 45000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "crossroads-replay-results-"));
  const url = "http://127.0.0.1:18347";
  const server = spawn(process.execPath, ["dist/node/server.cjs"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "18347", DATA_DIR: directory,
      ROOM_CREATE_PASSWORD: "testpassword123", BOT_INTERVAL_MS: "5", REPLAYS_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stderr?.on("data", (chunk) => { logs += chunk; });
  const socket = io(url, { autoConnect: false, transports: ["websocket"], reconnection: false });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${url}/api/health`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, logs || "Replay test server did not start");
    const sessionResponse = await fetch(`${url}/api/session`);
    assert.equal(sessionResponse.status, 200);
    const cookie = sessionResponse.headers.get("set-cookie")!.split(";")[0];
    socket.io.opts.extraHeaders = { Cookie: cookie };
    let room: RoomView | null = null;
    socket.on("room", (value: RoomView | null) => { room = value; });
    socket.connect();
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const command = (value: unknown) => new Promise<{ ok: boolean; error?: string }>((resolve) =>
      socket.emit("command", value, resolve));
    assert.equal((await command({ type: "create", name: "Replay host", password: "testpassword123",
      options: { ...DEFAULT_OPTIONS, seats: 2, target: 8 } })).ok, true);
    assert.equal((await command({ type: "bot" })).ok, true);
    const results = new Promise<{ replay?: SignedReplay }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Game did not finish. " + logs)), 35000);
      socket.once("game-results", (value) => { clearTimeout(timeout); resolve(value); });
    });
    assert.equal((await command({ type: "start" })).ok, true);
    assert.ok(room);
    const ownId = (room as RoomView).me;
    assert.equal((await command({ type: "takeover", id: ownId })).ok, true);
    const completed = await results;
    assert.ok(completed.replay, "Final results must include a replay download");
    const key = readFileSync(join(directory, "replay-signing-key"));
    assert.ok(verifyReplay(completed.replay, key));
    assert.equal(completed.replay.payload.frames[0].version, 0);
    assert.equal(completed.replay.payload.frames.at(-1)?.phase, "finished");
    const response = await fetch(`${url}/api/replay/verify`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(completed.replay),
    });
    assert.equal(response.status, 200);
    const imported = await response.json() as { replay: unknown };
    assert.deepEqual(imported.replay, completed.replay.payload);
  } finally {
    socket.close();
    if (server.exitCode === null) {
      const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await stopped;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
