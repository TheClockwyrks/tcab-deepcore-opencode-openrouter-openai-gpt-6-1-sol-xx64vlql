/* global document */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import console from "node:console";
import { URL } from "node:url";
import { chromium } from "playwright";

const prefix = "/expeditions/deepcore/";
const mime = {
  html: "text/html",
  js: "text/javascript",
  png: "image/png",
  json: "application/json",
  wav: "audio/wav",
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split("?")[0]);
    if (!path.startsWith(prefix) || path.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    const relative = path.slice(prefix.length) || "index.html";
    const bytes = await readFile(
      new URL(`../dist/${relative}`, import.meta.url),
    );
    res.writeHead(200, {
      "Content-Type":
        mime[relative.split(".").pop()] || "application/octet-stream",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(4187, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  const errors = [],
    failed = [],
    assets = new Set();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("response", (r) => {
    if (r.url().includes("/assets/")) {
      assets.add(r.url());
      if (r.status() !== 200) failed.push(`${r.status()} ${r.url()}`);
    }
  });
  await page.goto(`http://127.0.0.1:4187${prefix}`, {
    waitUntil: "networkidle",
  });
  assert(
    assets.size > 90,
    "All produced sprite, audio, and system assets loaded",
  );
  assert(
    [...assets].every((url) => url.includes(prefix + "assets/")),
    "Assets remain inside the nested document base",
  );
  const pixels = () =>
    page.evaluate(() => {
      const ctx = document.querySelector("canvas").getContext("2d");
      return Array.from(ctx.getImageData(160, 900, 1, 1).data);
    });
  const titlePixel = await pixels();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(70);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(70);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  assert.notDeepEqual(
    await pixels(),
    titlePixel,
    "The expedition replaced the title screen",
  );
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(50);
  await page.keyboard.press("Escape");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1800);
  await page.keyboard.up("KeyS");
  await page.keyboard.press("KeyI");
  await page.waitForTimeout(80);
  await page.keyboard.press("Escape");
  await page.keyboard.down("Space");
  await page.waitForTimeout(1400);
  await page.keyboard.up("Space");
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(80);
  await page.keyboard.press("KeyP");
  await page.keyboard.press("KeyM");
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(120);
  const dimensions = await page
    .locator("canvas")
    .evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  assert.deepEqual(
    dimensions,
    { width: 1600, height: 1800 },
    "Engine owns the high-DPI resize",
  );
  await page.screenshot({ path: "/tmp/opencode/production-portrait.png" });
  assert.deepEqual(failed, [], "No failed production requests");
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.info(
    `Production smoke passed: ${assets.size} nested-path assets, live mining, inventory, thrust, pause, mute, and high-DPI resize.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
