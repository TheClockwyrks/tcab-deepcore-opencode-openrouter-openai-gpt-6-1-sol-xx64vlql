/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run with the development server already listening on port 5173.
// The handle stays in this capture process: the game publishes no page globals.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => {
  throw error;
});
await page.route("**/capture.html", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body style="margin:0;background:#0b1720"><canvas style="width:1280px;height:720px;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture.html");
const handle = await page.evaluateHandle(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  return engine;
});
await handle.evaluate(async (engine) => {
  const d = engine.debug;
  const pose = (fn) => engine.apply(fn);
  pose((s) => d.setWorldSize(s, "quick"));
  pose((s) => d.generateMine(s));
  pose((s) => d.setScreen(s, "in-mine"));
  for (const [track, tier] of [
    ["fuel", 3],
    ["hull", 3],
    ["drill", 3],
    ["jetpack", 2],
    ["cargo", 2],
    ["scanner", 2],
  ])
    pose((s) => d.setTier(s, track, tier));
  pose((s) => d.setFuel(s, 244));
  pose((s) => d.setHull(s, 204));
  pose((s) => d.setCredits(s, 1240));
  for (let row = 72; row <= 81; row++)
    pose((s) => d.setTile(s, 16, row, "tunnel"));
  for (let col = 13; col <= 20; col++)
    pose((s) => d.setTile(s, col, 79, "tunnel"));
  for (let row = 82; row <= 92; row++)
    pose((s) => d.setOreTile(s, 16, row, row % 2 ? "argenite" : "cuprite"));
  pose((s) => d.setMaterialTile(s, 20, 84, "resonite"));
  pose((s) => d.setOreTile(s, 14, 83, "verdite"));
  pose((s) => d.setTile(s, 21, 85, "gas"));
  pose((s) => d.setMinerPosition(s, 16 * 80 + 12, 82 * 80 - 72));
  await engine.advance(1);
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  engine.startRecording();
  await engine.advance(72);
});
await page.screenshot({ path: "showcase/rockbed.png" });
const recording = await handle.evaluate(async (engine) => {
  await engine.advance(48);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  await engine.advance(54);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
  return engine.stopRecording();
});
await writeFile(
  "showcase/descent.json.gz",
  gzipSync(JSON.stringify(recording), { level: 9 }),
);
await handle.evaluate(async (engine) => {
  const d = engine.debug;
  engine.apply((s) => d.setMinerPosition(s, 4 * 80 + 12, 8));
  engine.apply((s) => d.setMinerVelocity(s, 0, 0));
  engine.apply((s) => d.setRocketInstalled(s, 2));
  engine.apply((s) => d.setCameraLead(s, 0));
  await engine.advance(1);
});
await page.screenshot({ path: "showcase/surface.png" });
await handle.evaluate(async (engine) => {
  const d = engine.debug;
  const pose = (fn) => engine.apply(fn);
  pose((s) => d.setTier(s, "fuel", 5));
  pose((s) => d.setTier(s, "hull", 5));
  pose((s) => d.setTier(s, "jetpack", 5));
  pose((s) => d.setFuel(s, 390));
  pose((s) => d.setHull(s, 383));
  pose((s) => d.setCargo(s, "pyronium", 4));
  pose((s) => d.setCargo(s, "cindrite", 2));
  pose((s) => d.setCredits(s, 5720));
  pose((s) => d.setRocketInstalled(s, 4));
  pose((s) => d.setMaterial(s, "resonite", 1));
  pose((s) => d.setMaterial(s, "cryenite", 1));
  for (let row = 241; row < 250; row++)
    pose((s) => d.setTile(s, 16, row, "tunnel"));
  for (let col = 12; col <= 20; col++)
    pose((s) => d.setTile(s, col, 247, "tunnel"));
  for (let row = 248; row <= 249; row++)
    for (let col = 19; col <= 22; col++)
      pose((s) => d.setTile(s, col, row, "lava"));
  pose((s) => d.setOreTile(s, 13, 246, "aurite"));
  pose((s) => d.setTile(s, 14, 248, "gas"));
  pose((s) => d.setMinerPosition(s, 16 * 80 + 12, 250 * 80 - 72));
  pose((s) => d.setMinerVelocity(s, 0, 0));
  pose((s) => d.setCameraLead(s, 0));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  await engine.advance(6);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  await engine.advance(24);
});
await page.screenshot({ path: "showcase/core.png" });
await handle.evaluate((engine) => engine.destroy());
await browser.close();
