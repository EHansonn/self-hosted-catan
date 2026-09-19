import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import {
  COLORS,
  DEFAULT_OPTIONS,
  makeBoard,
  mapGenerationRules,
  type RoomView,
  type ResumeRoomView,
  type Action,
} from "../shared/game";
import type { CommunityView } from "../shared/community";
type LiveRoomView = RoomView & { paused: boolean };
const key = "test-only-crossroads-key",
  url = "http://127.0.0.1:18341";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("packaged server: guest joins, creator-only rooms, scaled tables, privacy, reconnect and restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crossroads-test-"));
  let proc: ChildProcess;
  const sockets: Socket[] = [];
  let logs = "";
  const start = async () => {
    proc = spawn(process.execPath, ["dist/node/server.cjs"], {
      env: {
        ...process.env,
        PORT: "18341",
        HOST: "127.0.0.1",
        DATA_DIR: dir,
        APP_NAME: "Test Table",
        ROOM_CREATE_PASSWORD: key,
        SECURE_COOKIE: "true",
        ALLOWED_ORIGINS: "https://catan.example",
        BOT_INTERVAL_MS: "50",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout?.on("data", (d) => (logs += d));
    proc.stderr?.on("data", (d) => (logs += d));
    for (let n = 0; n < 80; n++) {
      try {
        if ((await fetch(url + "/api/health")).ok) return;
      } catch {}
      if (proc.exitCode !== null) throw new Error(logs);
      await delay(50);
    }
    throw new Error("Server did not start: " + logs);
  };
  const stop = async () => {
    if (proc.exitCode !== null) return;
    const done = new Promise<void>((r) => proc.once("exit", () => r()));
    proc.kill("SIGTERM");
    await done;
  };
  const createSession = async () => {
    const res = await fetch(url + "/api/session");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { authenticated?: boolean };
    assert.equal(body.authenticated, true);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    assert.ok(res.headers.get("set-cookie")!.includes("HttpOnly"));
    assert.ok(res.headers.get("set-cookie")!.includes("SameSite=Strict"));
    assert.ok(res.headers.get("set-cookie")!.includes("Secure"));
    return cookie;
  };
  const connect = async (cookie: string) => {
    const s = io(url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });
    sockets.push(s);
    let state: LiveRoomView | null = null;
    let resumable: ResumeRoomView[] = [];
    let community: CommunityView | null = null;
    s.on("room", (r) => (state = r));
    s.on("resume-options", (r) => (resumable = r));
    s.on("community", (view) => (community = view));
    await new Promise<void>((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", reject);
    });
    const cmd = (v: unknown) =>
      new Promise<{
        ok: boolean;
        error?: string;
        reason?: "stale";
        version?: number;
      }>((resolve, reject) =>
        s
          .timeout(3000)
          .emit(
            "command",
            v,
            (
              e: Error | null,
              r: {
                ok: boolean;
                error?: string;
                reason?: "stale";
                version?: number;
              },
            ) => (e ? reject(e) : resolve(r)),
          ),
      );
    await cmd({ type: "sync" });
    return {
      socket: s,
      cmd,
      get state() {
        return state;
      },
      get resumable() {
        return resumable;
      },
      get community() {
        return community;
      },
    };
  };
  try {
    await start();
    const health = await fetch(url + "/api/health");
    assert.deepEqual(await health.json(), { ok: true, name: "Test Table" });
    const redirect = await new Promise<{
      status: number | undefined;
      location: string | undefined;
    }>((resolve, reject) => {
      const request = http.get(
        url + "/join?code=private",
        {
          headers: {
            Host: "catan.example",
            "X-Forwarded-Proto": "http",
          },
        },
        (response) => {
          response.resume();
          resolve({
            status: response.statusCode,
            location: response.headers.location,
          });
        },
      );
      request.on("error", reject);
    });
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.location,
      "https://catan.example/join?code=private",
    );
    const config = await fetch(url + "/api/config");
    assert.deepEqual(await config.json(), { appName: "Test Table" });
    const home = await fetch(url + "/");
    assert.equal(home.status, 200);
    const headers = home.headers;
    assert.ok(
      headers
        .get("content-security-policy")
        ?.includes("frame-ancestors 'none'"),
    );
    assert.ok(headers.get("x-robots-tag")?.includes("noindex"));
    assert.ok(headers.get("x-robots-tag")?.includes("nosnippet"));
    assert.equal(
      headers.get("cross-origin-resource-policy"),
      "same-origin",
    );
    assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
    assert.ok(headers.get("permissions-policy")?.includes("camera=()"));
    assert.equal(
      headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assert.match(await home.text(), /name="robots" content="noindex/);
    const robots = await fetch(url + "/robots.txt");
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /User-agent: \*\s+Disallow: \//);
    assert.equal(
      (
        await fetch(url + "/api/session", {
          headers: {
            Origin: "https://untrusted.example",
          },
        })
      ).status,
      403,
    );
    const stranger = io(url, {
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(stranger);
    await new Promise<void>((resolve, reject) => {
      stranger.once("connect", () =>
        reject(new Error("Unauthenticated socket accepted")),
      );
      stranger.once("connect_error", () => resolve());
    });
    stranger.close();
    const cookies: string[] = [];
    for (let i = 0; i < 6; i++) cookies.push(await createSession());
    const clients: Awaited<ReturnType<typeof connect>>[] = [];
    for (const cookie of cookies) clients.push(await connect(cookie));
    const host = clients[0];
    assert.equal(host.community!.totalGames, 0);
    assert.equal(
      (
        await host.cmd({
          type: "nameSheep",
          matchId: "0".repeat(24),
          name: "Forger",
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await clients[1].cmd({
          type: "create",
          name: "Guest creator",
          password: "incorrect-key",
          options: { ...DEFAULT_OPTIONS, seats: 6 },
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await host.cmd({
          type: "create",
          name: "Host",
          options: { ...DEFAULT_OPTIONS, seats: 6 },
        })
      ).ok,
      false,
    );
    assert.ok(
      (
        await clients[1].cmd({
          type: "create",
          name: "Default host",
          password: key,
        })
      ).ok,
    );
    assert.deepEqual(clients[1].state!.options, DEFAULT_OPTIONS);
    assert.ok((await clients[1].cmd({ type: "close" })).ok);
    assert.equal(
      (
        await host.cmd({
          type: "create",
          name: "Too large",
          password: key,
          options: { ...DEFAULT_OPTIONS, seats: 13 },
        })
      ).ok,
      false,
    );
    assert.ok(
      (
        await host.cmd({
          type: "create",
          name: "Large host",
          password: key,
          options: { ...DEFAULT_OPTIONS, seats: 12 },
        })
      ).ok,
    );
    for (let i = 1; i < 12; i++)
      assert.ok((await host.cmd({ type: "bot" })).ok);
    const largeRoomCode = host.state!.code;
    assert.equal(host.state!.players.length, 12);
    assert.equal(new Set(host.state!.players.map((player) => player.color)).size, 12);
    const largeRoomBotNames = host.state!.players
      .filter((player) => player.bot)
      .map((player) => player.name);
    assert.equal(new Set(largeRoomBotNames).size, 11);
    assert.ok(largeRoomBotNames.every((name) => !/^Bot(?: |$)/.test(name)));
    assert.ok((await host.cmd({ type: "start" })).ok);
    assert.equal(host.state!.game!.board.tiles.length, 61);
    const botMatchSnapshot = JSON.parse(
      readFileSync(join(dir, "state.json"), "utf8"),
    );
    const botMatchRoom = botMatchSnapshot.rooms.find(
      (room: { code: string }) => room.code === largeRoomCode,
    );
    assert.equal(botMatchRoom.startingHumanPlayers, 1);
    assert.equal(botMatchRoom.leaderboardEligible, false);
    assert.ok((await host.cmd({ type: "close" })).ok);
    assert.ok(
      (
        await host.cmd({
          type: "create",
          name: "Host",
          password: key,
          color: COLORS[5],
          options: { ...DEFAULT_OPTIONS, seats: 6 },
        })
      ).ok,
    );
    assert.equal(host.state!.players[0].color, COLORS[5]);
    const code = host.state!.code;
    const duplicateName = await clients[1].cmd({
      type: "join",
      name: " hOsT ",
      code,
    });
    assert.equal(duplicateName.ok, false);
    assert.match(duplicateName.error || "", /already being used/);
    await host.cmd({ type: "sync" });
    assert.equal(host.state!.players.length, 1);
    for (let i = 1; i < 6; i++)
      assert.ok(
        (
          await clients[i].cmd({
            type: "join",
            name: "Guest " + i,
            code,
            color: i === 1 ? COLORS[5] : undefined,
          })
        ).ok,
      );
    assert.notEqual(
      host.state!.players.find((player) => player.id === clients[1].state!.me)!.color,
      COLORS[5],
    );
    assert.ok((await clients[1].cmd({ type: "color", color: COLORS[11] })).ok);
    await host.cmd({ type: "sync" });
    assert.equal(
      host.state!.players.find((player) => player.id === clients[1].state!.me)!.color,
      COLORS[11],
    );
    assert.equal(
      (await clients[2].cmd({ type: "color", color: COLORS[11] })).ok,
      false,
    );
    assert.equal(
      (await clients[2].cmd({ type: "color", color: "not-a-color" })).ok,
      false,
    );
    const customMapOptions = {
      ...host.state!.options,
      allowSixEightTouch: false,
      allowTwoTwelveTouch: false,
      allowSameNumbersTouch: false,
      allowSameResourcesTouch: false,
    };
    assert.equal(
      (await clients[1].cmd({ type: "options", options: customMapOptions })).ok,
      false,
    );
    assert.ok(
      (await host.cmd({ type: "options", options: customMapOptions })).ok,
    );
    assert.deepEqual(host.state!.options, customMapOptions);
    const initialMapSeed = host.state!.mapSeed;
    assert.equal(clients[1].state!.mapSeed, initialMapSeed);
    assert.equal(
      (await clients[1].cmd({ type: "mapSeed", direction: "shuffle" })).ok,
      false,
    );
    assert.ok((await host.cmd({ type: "mapSeed", direction: "next" })).ok);
    assert.equal(host.state!.mapSeed, (initialMapSeed + 1) >>> 0);
    assert.ok((await host.cmd({ type: "mapSeed", direction: "previous" })).ok);
    assert.equal(host.state!.mapSeed, initialMapSeed);
    assert.ok((await host.cmd({ type: "mapSeed", direction: "shuffle" })).ok);
    const selectedMapSeed = host.state!.mapSeed;
    assert.notEqual(selectedMapSeed, initialMapSeed);
    await clients[1].cmd({ type: "sync" });
    assert.equal(clients[1].state!.mapSeed, selectedMapSeed);
    const previewBoard = makeBoard(
      6,
      selectedMapSeed,
      mapGenerationRules(customMapOptions),
    );
    const seatedIds = host.state!.players.map((player) => player.id).sort();
    assert.equal((await clients[1].cmd({ type: "start" })).ok, false);
    assert.ok((await host.cmd({ type: "start" })).ok);
    assert.equal(
      (await clients[1].cmd({ type: "color", color: COLORS[10] })).ok,
      false,
    );
    assert.equal(host.state!.game!.board.tiles.length, 30);
    assert.deepEqual(host.state!.game!.board, previewBoard);
    assert.deepEqual(
      host.state!.game!.players.map((player) => player.id).sort(),
      seatedIds,
    );
    assert.deepEqual(
      host.state!.players.map((player) => player.id),
      host.state!.game!.players.map((player) => player.id),
    );
    const freshTab = await connect(cookies[0]);
    assert.equal(freshTab.state, null);
    assert.equal(freshTab.resumable.length, 1);
    assert.equal(freshTab.resumable[0].code, code);
    await host.cmd({ type: "sync" });
    assert.equal(freshTab.state, null);
    assert.ok((await freshTab.cmd({ type: "resume", code })).ok);
    assert.equal(freshTab.state!.code, code);
    assert.ok((await freshTab.cmd({ type: "home" })).ok);
    assert.equal(freshTab.state, null);
    assert.equal(freshTab.resumable[0].code, code);
    freshTab.socket.close();
    const freshIdentityResponse = await fetch(url + "/api/session/new", {
      method: "POST",
      headers: { Cookie: cookies[0], Origin: url },
    });
    assert.equal(freshIdentityResponse.status, 200);
    const freshIdentityCookie = freshIdentityResponse.headers
      .get("set-cookie")!
      .split(";")[0];
    assert.notEqual(freshIdentityCookie, cookies[0]);
    const freshIdentity = await connect(freshIdentityCookie);
    assert.equal(freshIdentity.state, null);
    assert.deepEqual(freshIdentity.resumable, []);
    freshIdentity.socket.close();
    assert.equal(host.state!.code, code);
    assert.equal(
      (
        await host.cmd({
          type: "action",
          version: 0,
          action: { type: "road", id: 99999 },
        })
      ).ok,
      false,
    );
    const outsiders = await connect(await createSession());
    assert.equal(outsiders.state, null);
    assert.equal(
      (
        await outsiders.cmd({
          type: "action",
          version: 0,
          action: { type: "roll" },
        })
      ).ok,
      false,
    );
    assert.equal(
      (await outsiders.cmd({ type: "join", code, name: "" })).ok,
      false,
    );
    assert.ok(
      (await outsiders.cmd({ type: "join", code, name: "Observer" })).ok,
    );
    await outsiders.cmd({ type: "sync" });
    assert.equal(outsiders.state!.spectator, true);
    assert.equal(outsiders.state!.players.length, 6);
    assert.ok(
      !outsiders.state!.players.some(
        (player) => player.id === outsiders.state!.me,
      ),
    );
    assert.ok(
      outsiders.state!.players.every(
        (player) => !player.resources && !player.dev,
      ),
    );
    assert.deepEqual(outsiders.state!.game!.legal.settlements, []);
    assert.deepEqual(outsiders.state!.game!.legal.roads, []);
    assert.deepEqual(outsiders.state!.game!.legal.cities, []);
    assert.deepEqual(outsiders.state!.game!.legal.robber, []);
    assert.ok(!("rng" in outsiders.state!.game!));
    assert.ok(!("deck" in outsiders.state!.game!));
    assert.equal(
      (
        await outsiders.cmd({
          type: "action",
          version: outsiders.state!.game!.version,
          action: { type: "roll" },
        })
      ).ok,
      false,
    );
    assert.equal((await outsiders.cmd({ type: "chat", text: "hello" })).ok, false);
    assert.equal(
      (
        await outsiders.cmd({
          type: "specialBuild",
          version: outsiders.state!.game!.version,
        })
      ).ok,
      false,
    );
    assert.equal((await outsiders.cmd({ type: "close" })).ok, false);
    assert.equal(host.state!.players.length, 6);
    assert.ok((await outsiders.cmd({ type: "home" })).ok);
    assert.equal(outsiders.state, null);
    assert.ok(
      (await outsiders.cmd({ type: "join", code, name: "Observer" })).ok,
    );
    await outsiders.cmd({ type: "sync" });
    assert.equal(outsiders.state!.spectator, true);
    assert.equal(host.state!.players.length, 6);
    while (host.state!.game!.phase.startsWith("setup")) {
      const g = host.state!.game!,
        currentId = g.players[g.current].id,
        current = clients.find((client) => client.state?.me === currentId)!;
      await current.cmd({ type: "sync" });
      const cg = current.state!.game!;
      const action: Action =
        cg.phase === "setupSettlement"
          ? { type: "settlement", id: cg.legal.settlements[0] }
          : { type: "road", id: cg.legal.roads[0] };
      const r = await current.cmd({
        type: "action",
        version: cg.version,
        action,
      });
      assert.ok(r.ok, r.error);
      await host.cmd({ type: "sync" });
    }
    assert.equal(host.state!.game!.phase, "roll");
    for (let i = 0; i < 6; i++) {
      await clients[i].cmd({ type: "sync" });
      const s = clients[i].state!;
      assert.ok(s.players.find((p) => p.id === s.me)!.resources);
      assert.ok(
        s.players
          .filter((p) => p.id !== s.me)
          .every((p) => !p.resources && !p.dev),
      );
      assert.ok(!("rng" in s.game!));
      assert.ok(!("deck" in s.game!));
    }
    await outsiders.cmd({ type: "sync" });
    assert.ok(
      outsiders.state!.players.every(
        (player) => !player.resources && !player.dev,
      ),
    );
    const rollingGame = host.state!.game!,
      version = rollingGame.version,
      rollingId = rollingGame.players[rollingGame.current].id,
      rollingClient = clients.find((client) => client.state?.me === rollingId)!,
      waitingClient = clients.find((client) => client.state?.me !== rollingId)!;
    assert.equal(
      (
        await waitingClient.cmd({
          type: "action",
          version,
          action: { type: "roll" },
        })
      ).ok,
      false,
    );
    assert.ok(
      (
        await rollingClient.cmd({
          type: "action",
          version,
          action: { type: "roll" },
        })
      ).ok,
    );
    await waitingClient.cmd({ type: "sync" });
    assert.ok(
      (
        await waitingClient.cmd({
          type: "specialBuild",
          version: waitingClient.state!.game!.version,
        })
      ).ok,
    );
    await waitingClient.cmd({ type: "sync" });
    assert.ok(
      waitingClient.state!.game!.specialBuildRequests.includes(
        waitingClient.state!.me,
      ),
    );
    assert.ok(
      (
        await waitingClient.cmd({
          type: "specialBuild",
          version: waitingClient.state!.game!.version,
        })
      ).ok,
    );
    await waitingClient.cmd({ type: "sync" });
    assert.ok(
      !waitingClient.state!.game!.specialBuildRequests.includes(
        waitingClient.state!.me,
      ),
    );
    await rollingClient.cmd({ type: "sync" });
    assert.equal(
      (
        await rollingClient.cmd({
          type: "specialBuild",
          version: rollingClient.state!.game!.version,
        })
      ).ok,
      false,
    );
    const staleRoll = await rollingClient.cmd({
      type: "action",
      version,
      action: { type: "roll" },
    });
    assert.equal(staleRoll.ok, false);
    assert.equal(staleRoll.reason, "stale");
    assert.equal(staleRoll.version, rollingClient.state!.game!.version);
    assert.equal((await clients[1].cmd({ type: "close" })).ok, false);
    assert.equal((await clients[1].cmd({ type: "pause" })).ok, false);
    assert.equal(
      (await clients[1].cmd({ type: "takeover", id: host.state!.me })).ok,
      false,
    );
    const remainingBeforePause = host.state!.game!.deadline! - Date.now();
    const activeRuntimeBeforePause = host.state!.game!.pausedMs;
    assert.ok((await host.cmd({ type: "pause" })).ok);
    assert.equal(host.state!.paused, true);
    assert.equal(host.state!.game!.deadline, null);
    assert.ok(host.state!.game!.pausedAt! <= Date.now());
    assert.equal(host.state!.game!.pausedMs, activeRuntimeBeforePause);
    const paused = host.state!.game!.version;
    const privateId = clients[2].state!.me;
    clients[2].socket.close();
    const reconnected = await connect(cookies[2]);
    assert.equal(reconnected.state, null);
    assert.equal(reconnected.resumable[0].code, code);
    assert.ok((await reconnected.cmd({ type: "resume", code })).ok);
    assert.equal(reconnected.state!.me, privateId);
    assert.equal(reconnected.state!.game!.version, paused);
    const before = host.state!.game!;
    sockets.forEach((s) => s.close());
    await stop();
    const snapshot = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    assert.equal(snapshot.schema, 2);
    assert.equal(snapshot.community.totalGames, 0);
    assert.ok(
      !JSON.stringify(snapshot.sessions).includes(cookies[0].split("=")[1]),
    );
    const storedRoom = snapshot.rooms.find(
      (candidate: { code: string }) => candidate.code === code,
    );
    assert.equal(storedRoom.mapSeed, selectedMapSeed);
    assert.equal(storedRoom.paused, true);
    assert.equal(storedRoom.game.deadline, null);
    assert.ok(storedRoom.pausedRemainingMs <= remainingBeforePause);
    assert.ok(storedRoom.pausedRemainingMs > remainingBeforePause - 2000);
    const storedGame = structuredClone(storedRoom.game);
    storedRoom.game.phase = "finished";
    storedRoom.game.winner = storedRoom.game.players[0].id;
    storedRoom.game.deadline = null;
    storedRoom.updated = Date.now();
    writeFileSync(join(dir, "state.json"), JSON.stringify(snapshot));
    await start();
    const completedSnapshot = JSON.parse(
      readFileSync(join(dir, "state.json"), "utf8"),
    );
    assert.ok(
      !completedSnapshot.rooms.some(
        (candidate: { code: string }) => candidate.code === code,
      ),
    );
    assert.ok(
      completedSnapshot.sessions.every(
        ([, candidate]: [string, { room?: string }]) => candidate.room !== code,
      ),
    );
    assert.equal(completedSnapshot.community.totalGames, 1);
    const finishedHome = await connect(cookies[0]);
    assert.equal(finishedHome.state, null);
    assert.deepEqual(finishedHome.resumable, []);
    assert.equal(
      (await finishedHome.cmd({ type: "resume", code })).ok,
      false,
    );
    assert.ok(
      (
        await finishedHome.cmd({
          type: "create",
          name: "Next game host",
          password: key,
        })
      ).ok,
    );
    assert.notEqual(finishedHome.state!.code, code);
    finishedHome.socket.close();
    await stop();
    storedRoom.game = storedGame;
    storedRoom.updated = Date.now();
    writeFileSync(join(dir, "state.json"), JSON.stringify(snapshot));
    await start();
    const restored = await connect(cookies[0]);
    assert.equal(restored.state, null);
    assert.equal(restored.resumable[0].code, code);
    assert.ok((await restored.cmd({ type: "resume", code })).ok);
    assert.equal(restored.state!.code, code);
    assert.equal(restored.state!.mapSeed, selectedMapSeed);
    assert.equal(restored.state!.game!.version, before.version);
    assert.deepEqual(restored.state!.game!.board, before.board);
    assert.equal(restored.state!.paused, true);
    assert.equal(restored.state!.game!.deadline, null);
    assert.ok((await restored.cmd({ type: "pause" })).ok);
    assert.equal(restored.state!.paused, false);
    assert.equal(restored.state!.game!.pausedAt, null);
    assert.ok(restored.state!.game!.pausedMs > activeRuntimeBeforePause);
    const resumedRemaining = restored.state!.game!.deadline! - Date.now();
    assert.ok(resumedRemaining <= storedRoom.pausedRemainingMs + 200);
    assert.ok(resumedRemaining > storedRoom.pausedRemainingMs - 1000);
    assert.ok((await restored.cmd({type:'close'})).ok);
    assert.ok((await restored.cmd({type:'create',name:'Clock test',password:key,options:{...DEFAULT_OPTIONS,timer:60,setupSettlementTimer:5,setupRoadTimer:5,actionTimer:10}})).ok);
    for(let i=0;i<3;i++)assert.ok((await restored.cmd({type:'bot'})).ok);
    assert.ok((await restored.cmd({type:'start'})).ok);
    const humanSetupStart=Date.now();
    while(
      Date.now()-humanSetupStart<5000 &&
      (restored.state!.game!.players[restored.state!.game!.current].id!==restored.state!.me ||
        restored.state!.game!.phase!=="setupSettlement")
    )await delay(25);
    assert.equal(restored.state!.game!.players[restored.state!.game!.current].id,restored.state!.me);
    assert.equal(restored.state!.game!.phase,"setupSettlement");
    const timedSetupStep=restored.state!.game!.setupStep;
    // Use the real production clock: the expired settlement is chosen randomly,
    // then its required road receives a separate short action window.
    const timerStart=Date.now();
    const liveTimerPhase=()=>restored.state!.game!.phase;
    while(Date.now()-timerStart<15000 && liveTimerPhase()!=='setupRoad')await delay(100);
    assert.equal(restored.state!.game!.setupStep,timedSetupStep);
    assert.equal(restored.state!.game!.phase,'setupRoad');
    assert.ok(restored.state!.game!.deadline!>Date.now()+3000);
    const setupRoadRemaining = restored.state!.game!.deadline! - Date.now();
    assert.ok((await restored.cmd({type:'pause'})).ok);
    assert.equal(restored.state!.paused, true);
    assert.equal(restored.state!.game!.deadline, null);
    const timerVersion=restored.state!.game!.version;
    await delay(200);
    assert.equal(restored.state!.game!.version,timerVersion);
    assert.ok((await restored.cmd({type:'pause'})).ok);
    assert.equal(restored.state!.paused, false);
    const setupRoadResumed = restored.state!.game!.deadline! - Date.now();
    assert.ok(setupRoadResumed <= setupRoadRemaining + 200);
    assert.ok(setupRoadResumed > setupRoadRemaining - 1000);
    console.log('The short action timer advanced one expired placement and opened a fresh action window.');
    for (let i = 0; i < 150; i++) await restored.cmd({ type: "sync" });
    assert.equal((await restored.cmd({ type: "sync" })).ok, false);
  } finally {
    sockets.forEach((s) => s.close());
    await stop();
  }
});
