import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import { chooseBotAction } from "../shared/bot";
import {
  applyAction,
  createGame,
  DEFAULT_OPTIONS,
  makePlayer,
  type Game,
  type Options,
  type Player,
} from "../shared/game";
import { emptyCommunity } from "../shared/community";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "docs", "screenshots");
const desktopViewport = { width: 1920, height: 1080 };
const phoneViewport = { width: 390, height: 844 };
const lobbyCode = "A7C29F";
const gameCode = "D3E7B4";
const lobbyToken = "crossroads-screenshot-lobby-session";
const gameToken = "crossroads-screenshot-game-session";
const lobbyHostId = "screenshot-lobby-host";
const gameHostId = "screenshot-game-host";

type StoredRoom = {
  code: string;
  host: string;
  mapSeed: number;
  options: Options;
  players: Player[];
  game: Game | null;
  chat: { id: number; name: string; text: string }[];
  updated: number;
  matchId?: string;
  leaderboardEligible?: boolean;
  startingHumanPlayers?: number;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function screenshotOptions(): Options {
  return { ...DEFAULT_OPTIONS, seats: 4, timer: 120 };
}

function lobbyRoom(now: number): StoredRoom {
  const players = [
    makePlayer(lobbyHostId, "Atlas", 0),
    makePlayer("bot-lobby-willow", "Willow", 1, true),
    makePlayer("bot-lobby-kestrel", "Kestrel", 2, true),
    makePlayer("bot-lobby-reef", "Reef", 3, true),
  ];
  players.forEach((player) => (player.connected = false));
  return {
    code: lobbyCode,
    host: lobbyHostId,
    mapSeed: 0x2173fcf6,
    options: screenshotOptions(),
    players,
    game: null,
    chat: [],
    updated: now,
  };
}

function playToScreenshotState(players: Player[]) {
  let game = createGame(players, screenshotOptions(), 2173);
  for (let actions = 0; actions < 5000; actions++) {
    const ready =
      game.turn >= 55 &&
      game.phase === "main" &&
      game.players[game.current].id === gameHostId;
    if (ready) {
      game.deadline = Date.now() + 110_000;
      game.players.forEach((player) => (player.connected = false));
      return game;
    }
    if (game.phase === "finished")
      throw new Error("The deterministic screenshot game ended too early.");
    let moved = false;
    for (const player of game.players) {
      const action = chooseBotAction(game, player);
      if (!action) continue;
      game = applyAction(game, player.id, action);
      moved = true;
      break;
    }
    if (!moved)
      throw new Error(`The screenshot fixture stalled during ${game.phase}.`);
  }
  throw new Error("The screenshot fixture exceeded its action limit.");
}

function gameRoom(now: number): StoredRoom {
  const players = [
    makePlayer(gameHostId, "Atlas", 0),
    makePlayer("bot-game-willow", "Willow", 1, true),
    makePlayer("bot-game-kestrel", "Kestrel", 2, true),
    makePlayer("bot-game-reef", "Reef", 3, true),
  ];
  const game = playToScreenshotState(players);
  return {
    code: gameCode,
    host: gameHostId,
    mapSeed: 2173,
    options: screenshotOptions(),
    players: structuredClone(game.players),
    game,
    chat: [
      { id: 1, name: "Willow", text: "Ore for wheat?" },
      { id: 2, name: "Atlas", text: "Maybe next turn." },
    ],
    updated: now,
    matchId: "1234567890abcdef12345678",
    leaderboardEligible: false,
    startingHumanPlayers: 1,
  };
}

function writeFixture(dataDirectory: string) {
  const now = Date.now();
  const expires = now + 24 * 60 * 60 * 1000;
  const state = {
    schema: 2,
    sessions: [
      [sha256(lobbyToken), { id: lobbyHostId, expires, room: lobbyCode }],
      [sha256(gameToken), { id: gameHostId, expires, room: gameCode }],
    ],
    rooms: [lobbyRoom(now), gameRoom(now)],
    community: emptyCommunity(),
  };
  writeFileSync(join(dataDirectory, "state.json"), JSON.stringify(state));
}

async function availablePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a screenshot server port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function waitForServer(url: string, process: ChildProcess, logs: string[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {}
    if (process.exitCode !== null)
      throw new Error(`Screenshot server exited early.\n${logs.join("")}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Screenshot server did not start.\n${logs.join("")}`);
}

async function stopServer(process: ChildProcess) {
  if (process.exitCode !== null) return;
  const stopped = new Promise<void>((resolveStop) =>
    process.once("exit", () => resolveStop()),
  );
  process.kill("SIGTERM");
  await stopped;
}

async function prepareContext(
  baseUrl: string,
  viewport: { width: number; height: number },
  token?: string,
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    isMobile: viewport === phoneViewport,
    hasTouch: viewport === phoneViewport,
  });
  if (token)
    await context.addCookies([
      {
        name: "harbor_session",
        value: token,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
  await context.addInitScript(() => {
    localStorage.setItem("game-color-theme", "light");
    localStorage.setItem("gameplay-animations", "off");
    localStorage.setItem("harbor-mode", "2d");
  });
  return context;
}

async function settlePage(page: Page) {
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
  await page.addStyleTag({
    content: "*{caret-color:transparent!important}html{scroll-behavior:auto!important}",
  });
  await page.waitForTimeout(200);
}

async function pinVisibleClock(page: Page) {
  await page.locator(".turn-clock").evaluateAll((clocks) =>
    clocks.forEach((clock) => (clock.textContent = "01:42")),
  );
}

async function openSavedRoom(
  context: BrowserContext,
  baseUrl: string,
  expectedClass: "pregame" | "in-game",
) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const reconnect = page.getByRole("button", { name: "Reconnect" });
  await reconnect.waitFor();
  await reconnect.click();
  await page.locator(`main.${expectedClass}`).waitFor();
  await settlePage(page);
  return page;
}

async function captureDesktop(baseUrl: string) {
  const homeContext = await prepareContext(baseUrl, desktopViewport);
  const home = await homeContext.newPage();
  await home.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await home.getByRole("heading", { name: "Create or join" }).waitFor();
  await settlePage(home);
  await home.screenshot({ path: join(outputDirectory, "home.png") });
  await homeContext.close();

  const lobbyContext = await prepareContext(
    baseUrl,
    desktopViewport,
    lobbyToken,
  );
  const lobby = await openSavedRoom(lobbyContext, baseUrl, "pregame");
  await lobby.locator(".pregame-invite span").evaluate(
    (element, code) =>
      (element.textContent = `https://crossroads.local/?room=${code}`),
    lobbyCode,
  );
  await lobby.screenshot({ path: join(outputDirectory, "lobby-light.png") });
  await lobbyContext.close();

  const gameContext = await prepareContext(
    baseUrl,
    desktopViewport,
    gameToken,
  );
  const game = await openSavedRoom(gameContext, baseUrl, "in-game");
  await game.getByLabel("Interactive island game board").waitFor();
  await pinVisibleClock(game);
  await game.screenshot({ path: join(outputDirectory, "game-2d-light.png") });
  await game.getByRole("button", { name: "3D", exact: true }).click();
  await game.locator("canvas").waitFor();
  await game.waitForTimeout(800);
  await pinVisibleClock(game);
  await game.screenshot({ path: join(outputDirectory, "game-3d-light.png") });
  await gameContext.close();
}

async function captureMobile(baseUrl: string) {
  const context = await prepareContext(baseUrl, phoneViewport, gameToken);
  const page = await openSavedRoom(context, baseUrl, "in-game");
  await page.getByLabel("Interactive island game board").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await pinVisibleClock(page);
  const screen = await page.screenshot();
  await context.close();

  const frame = await browser.newPage({ viewport: { width: 470, height: 924 } });
  await frame.setContent(`<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: transparent; }
      body { display: grid; place-items: center; }
      .phone { position: relative; padding: 11px; border: 3px solid #151719; border-radius: 52px; background: #151719; box-shadow: 0 12px 30px #162b3f33; }
      .screen { width: ${phoneViewport.width}px; height: ${phoneViewport.height}px; padding-top: 25px; overflow: hidden; border-radius: 39px; background: #29649e; }
      img { display: block; width: 100%; height: auto; }
      .notch { position: absolute; z-index: 2; top: 11px; left: 50%; width: 124px; height: 25px; border-radius: 0 0 16px 16px; background: #151719; transform: translateX(-50%); }
    </style>
    <div class="phone">
      <div class="notch"></div>
      <div class="screen"><img alt="" src="data:image/png;base64,${screen.toString("base64")}"></div>
    </div>`);
  await frame.locator("img").waitFor();
  await frame.screenshot({
    path: join(outputDirectory, "mobile-light.png"),
    omitBackground: true,
  });
  await frame.close();
}

let browser: Awaited<ReturnType<typeof chromium.launch>>;

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  const dataDirectory = mkdtempSync(join(tmpdir(), "crossroads-screenshots-"));
  writeFixture(dataDirectory);
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const server = spawn(process.execPath, [join(root, "dist", "node", "server.cjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDirectory,
      STATIC_DIR: join(root, "dist", "client"),
      APP_NAME: "Crossroads",
      ROOM_CREATE_PASSWORD: "screenshot-only-password",
      BOT_INTERVAL_MS: "600000",
      CLEANUP_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr?.on("data", (chunk) => logs.push(String(chunk)));
  try {
    await waitForServer(baseUrl, server, logs);
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--use-angle=swiftshader"],
      });
    } catch (error) {
      throw new Error(
        `Could not start Chromium. Run "npx playwright install chromium" once, then retry.\n${error instanceof Error ? error.message : error}`,
      );
    }
    await captureDesktop(baseUrl);
    await captureMobile(baseUrl);
    console.log(`Updated README screenshots in ${outputDirectory}`);
  } finally {
    await browser?.close();
    await stopServer(server);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
}

await main();
