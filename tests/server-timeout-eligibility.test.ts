import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_OPTIONS, type RoomView } from "../shared/game";

const url = "http://127.0.0.1:18345";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a required timer fallback keeps a three-player game leaderboard eligible", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "crossroads-timeout-eligibility-"));
  let server: ChildProcess | undefined;
  const sockets: Socket[] = [];
  let logs = "";

  const createSession = async () => {
    const response = await fetch(`${url}/api/session`);
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  const connect = async (cookie: string) => {
    const socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });
    sockets.push(socket);
    let state: RoomView | null = null;
    socket.on("room", (room) => (state = room));
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const command = (value: unknown) =>
      new Promise<{ ok: boolean; error?: string }>((resolve, reject) =>
        socket.timeout(3000).emit(
          "command",
          value,
          (error: Error | null, result: { ok: boolean; error?: string }) =>
            error ? reject(error) : resolve(result),
        ),
      );
    await command({ type: "sync" });
    return {
      command,
      get state() {
        return state;
      },
    };
  };

  try {
    server = spawn(process.execPath, ["dist/node/server.cjs"], {
      env: {
        ...process.env,
        PORT: "18345",
        HOST: "127.0.0.1",
        DATA_DIR: dataDir,
        ROOM_CREATE_PASSWORD: "test-only-timeout-key",
        BOT_INTERVAL_MS: "25",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk) => (logs += chunk));
    server.stderr?.on("data", (chunk) => (logs += chunk));
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${url}/api/health`)).ok) break;
      } catch {}
      if (server.exitCode !== null) throw new Error(logs);
      await delay(25);
    }

    const host = await connect(await createSession());
    const guest = await connect(await createSession());
    const thirdPlayer = await connect(await createSession());
    assert.ok(
      (
        await host.command({
          type: "create",
          name: "Host",
          password: "test-only-timeout-key",
          options: {
            ...DEFAULT_OPTIONS,
            seats: 3,
            setupSettlementTimer: 5,
          },
        })
      ).ok,
    );
    const code = host.state!.code;
    assert.ok(
      (await guest.command({ type: "join", code, name: "Guest" })).ok,
    );
    assert.ok(
      (await thirdPlayer.command({ type: "join", code, name: "Third" })).ok,
    );
    assert.ok((await host.command({ type: "start" })).ok);
    const startingVersion = host.state!.game!.version;
    const deadline = Date.now() + 7_000;
    while (
      Date.now() < deadline &&
      host.state!.game!.version === startingVersion
    )
      await delay(50);
    assert.ok(host.state!.game!.version > startingVersion);

    const snapshot = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as {
      rooms: { code: string; leaderboardEligible?: boolean }[];
    };
    assert.equal(
      snapshot.rooms.find((room) => room.code === code)?.leaderboardEligible,
      true,
    );
  } finally {
    sockets.forEach((socket) => socket.close());
    if (server && server.exitCode === null) {
      const stopped = new Promise<void>((resolve) =>
        server!.once("exit", () => resolve()),
      );
      server.kill("SIGTERM");
      await stopped;
    }
  }
});
