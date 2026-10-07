import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createGame, DEFAULT_OPTIONS, makePlayer, note } from "../shared/game";
import { appendReplayFrame, signReplay, startReplay } from "../server/replay";

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function run() {
  const directory = mkdtempSync(join(tmpdir(), "crossroads-replay-ui-"));
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["dist/node/server.cjs"], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: directory,
      ROOM_CREATE_PASSWORD: "testpassword123", REPLAYS_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  let logs = "";
  server.stdout?.on("data", (chunk) => { logs += chunk; });
  server.stderr?.on("data", (chunk) => { logs += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${url}/api/health`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, logs || "Server did not start");
    const key = readFileSync(join(directory, "replay-signing-key"));
    const game = createGame([makePlayer("secret-a", "Alice", 0), makePlayer("secret-b", "Bob", 1)],
      { ...DEFAULT_OPTIONS, seats: 2 }, 17);
    const replay = startReplay(game, "0123456789abcdef01234567", "ABC123");
    appendReplayFrame(replay, game);
    game.board.vertices[0].owner = game.players[0].id;
    game.players[0].resources.ore = 3;
    game.players[0].dev.push({ type: "roadBuilding", bought: 1 });
    game.players[1].resources.wood = 2;
    game.players[1].dev.push({ type: "victory", bought: 1 });
    note(game, "Alice builds a settlement.");
    game.version++;
    appendReplayFrame(replay, game);
    game.players[1].resources.wood = 0;
    game.phase = "finished";
    game.winner = game.players[0].id;
    game.finishedAt = Date.now();
    game.version++;
    appendReplayFrame(replay, game);
    const signed = signReplay(replay, key);
    assert.ok(signed);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    await context.addInitScript(() => localStorage.setItem("game-color-theme", "light"));
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Settings" }).click();
    const fileInput = page.getByLabel("Choose replay file");
    await fileInput.setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(signed)) });
    await page.getByRole("heading", { name: "Game replay" }).waitFor();
    assert.equal(await page.getByText("Step 1 / 3").isVisible(), true);
    assert.equal(await page.getByText("No resource cards").first().isVisible(), true);
    await page.getByRole("button", { name: "Next step" }).click();
    assert.equal(await page.getByText("Step 2 / 3").isVisible(), true);
    assert.equal(await page.getByRole("img", { name: "3 Ore" }).isVisible(), true);
    assert.equal(await page.getByRole("img", { name: "Road Building" }).isVisible(), true);
    await page.getByRole("button", { name: "Inspect Bob's hand" }).click();
    assert.equal(await page.getByRole("img", { name: "2 Wood" }).isVisible(), true);
    assert.equal(await page.getByRole("img", { name: "Victory Point" }).isVisible(), true);
    await page.getByRole("button", { name: "Play replay" }).click();
    await page.getByText("Step 3 / 3").waitFor();
    assert.equal(await page.getByText("No resource cards").first().isVisible(), true);
    await page.getByRole("button", { name: "Play replay" }).waitFor();
    await page.getByRole("slider", { name: "Replay step" }).fill("0");
    assert.equal(await page.getByText("Step 1 / 3").isVisible(), true);
    await page.getByRole("slider", { name: "Replay step" }).fill("2");
    assert.equal(await page.getByText("Step 3 / 3").isVisible(), true);
    await page.screenshot({ path: join(tmpdir(), "catan-replay-smoke.png") });
    await page.getByRole("button", { name: "Close replay" }).click();
    assert.equal(await page.getByRole("heading", { name: "Game replay" }).count(), 0);
    await page.getByRole("button", { name: "Settings" }).click();
    const invalid = { ...signed, signature: "x".repeat(43) };
    await page.getByLabel("Choose replay file").setInputFiles({ name: "edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid)) });
    await page.getByText("This is not a valid replay from this server.").waitFor();
    await context.close();
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, colorScheme: "light" });
    const phone = await phoneContext.newPage();
    await phone.goto(url);
    await phone.getByRole("button", { name: "Settings" }).click();
    await phone.getByLabel("Choose replay file").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(signed)) });
    await phone.getByRole("heading", { name: "Game replay" }).waitFor();
    await phone.getByRole("button", { name: "Next step" }).click();
    await phone.getByRole("button", { name: "Inspect Bob's hand" }).click();
    assert.equal(await phone.getByRole("img", { name: "2 Wood" }).isVisible(), true);
    assert.ok((await phone.locator(".replay-players li").first().boundingBox())!.height > 0);
    await phone.screenshot({ path: join(tmpdir(), "catan-replay-smoke-mobile.png") });
    await phoneContext.close();
    process.stdout.write("Replay browser smoke test passed. Screenshots: " +
      join(tmpdir(), "catan-replay-smoke.png") + ", " + join(tmpdir(), "catan-replay-smoke-mobile.png") + "\n");
  } finally {
    await browser.close();
    if (server.exitCode === null) {
      const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await stopped;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

void run();
