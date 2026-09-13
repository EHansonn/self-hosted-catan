import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_OPTIONS, type RoomView } from "../shared/game";

const url = "http://127.0.0.1:18343";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("disconnected seats get temporary help and hosts can permanently replace a player", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "crossroads-player-takeover-test-"));
  let serverProcess: ChildProcess | undefined;
  const sockets: Socket[] = [];
  let logs = "";

  const startServer = async () => {
    serverProcess = spawn(globalThis.process.execPath, ["dist/node/server.cjs"], {
      env: {
        ...globalThis.process.env,
        PORT: "18343",
        HOST: "127.0.0.1",
        DATA_DIR: dataDir,
        ROOM_CREATE_PASSWORD: "test-only-player-takeover-key",
        PLAYER_DISCONNECT_GRACE_MS: "1000",
        EMPTY_GAME_GRACE_MS: "5000",
        CLEANUP_INTERVAL_MS: "100",
        BOT_INTERVAL_MS: "5000",
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
  const createSession = async () => {
    const response = await fetch(url + "/api/session");
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
      socket,
      command,
      get state() {
        return state;
      },
    };
  };
  const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (condition()) return;
      await delay(25);
    }
    throw new Error("Timed out waiting for player takeover state.");
  };

  try {
    await startServer();
    const hostCookie = await createSession();
    const guestCookie = await createSession();
    const thirdCookie = await createSession();
    const host = await connect(hostCookie);
    const guest = await connect(guestCookie);
    const third = await connect(thirdCookie);
    assert.ok(
      (
        await host.command({
          type: "create",
          name: "Host",
          password: "test-only-player-takeover-key",
          options: { ...DEFAULT_OPTIONS, seats: 3 },
        })
      ).ok,
    );
    const code = host.state!.code;
    assert.ok(
      (await guest.command({ type: "join", code, name: "Guest" })).ok,
    );
    assert.ok(
      (await third.command({ type: "join", code, name: "Third" })).ok,
    );
    const guestId = guest.state!.me;
    assert.ok((await host.command({ type: "start" })).ok);

    guest.socket.close();
    await waitFor(
      () =>
        host.state?.game?.players.find((player) => player.id === guestId)
          ?.automated === true,
    );
    assert.match(
      host.state!.game!.log.at(-1)!.text,
      /Guest disconnected, so a bot is playing their seat\./,
    );
    let snapshot = JSON.parse(readFileSync(join(dataDir, "state.json"), "utf8"));
    assert.equal(
      snapshot.rooms.find((room: { code: string }) => room.code === code)
        ?.leaderboardEligible,
      true,
    );

    const returned = await connect(guestCookie);
    assert.ok(
      (await returned.command({ type: "resume", code, name: "Guest" })).ok,
    );
    await waitFor(
      () =>
        returned.state?.game?.players.find((player) => player.id === guestId)
          ?.automated !== true,
    );
    assert.match(
      returned.state!.game!.log.at(-1)!.text,
      /Guest reconnected and resumed control\./,
    );

    assert.equal(
      (await returned.command({ type: "remove", id: host.state!.me })).ok,
      false,
    );
    const beforeReplacement = host.state!.game!.players.find(
      (player) => player.id === guestId,
    )!;
    const turnOrder = host.state!.game!.players.map((player) => player.id);
    assert.ok((await host.command({ type: "remove", id: guestId })).ok);
    await waitFor(
      () =>
        host.state?.game?.players.find((player) => player.id === guestId)
          ?.bot === true,
    );
    const replacement = host.state!.game!.players.find(
      (player) => player.id === guestId,
    )!;
    assert.equal(replacement.bot, true);
    assert.equal(replacement.automated, undefined);
    assert.notEqual(replacement.name, beforeReplacement.name);
    assert.equal(replacement.color, beforeReplacement.color);
    assert.equal(replacement.cardCount, beforeReplacement.cardCount);
    assert.equal(replacement.devCount, beforeReplacement.devCount);
    assert.equal(replacement.points, beforeReplacement.points);
    assert.deepEqual(
      host.state!.game!.players.map((player) => player.id),
      turnOrder,
    );
    assert.match(
      host.state!.game!.log.at(-1)!.text,
      /Guest was removed by the host\. .+ is now playing that seat\./,
    );
    snapshot = JSON.parse(readFileSync(join(dataDir, "state.json"), "utf8"));
    assert.equal(
      snapshot.rooms.find((room: { code: string }) => room.code === code)
        ?.leaderboardEligible,
      true,
    );
    await waitFor(() => returned.state === null);
    assert.equal(
      (await returned.command({ type: "resume", code, name: "Guest" })).ok,
      false,
    );
  } finally {
    sockets.forEach((socket) => socket.close());
    await stopServer();
  }
});
