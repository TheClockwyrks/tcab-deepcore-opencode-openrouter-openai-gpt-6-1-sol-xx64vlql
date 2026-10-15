/// <reference types="node" />
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreDebugApi, type DeepcoreState } from "./game";
import * as C from "./constants";
import { initial, type Assets } from "./model";
import { debugApi } from "./debug";
import { generate } from "./world";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
let assets: Assets;
let renderFrames = false;
let engine: Engine<DeepcoreState, DeepcoreDebugApi>;
let events: EventTarget;
const storage = new MemoryStorage();
const activeKeys = new Set<string>();
function key(code: string, down = true): void {
  const event = new Event(down ? "keydown" : "keyup");
  Object.assign(event, { code, repeat: false });
  events.dispatchEvent(event);
  if (down) activeKeys.add(code);
  else activeKeys.delete(code);
}
async function tap(code: string): Promise<void> {
  key(code);
  await engine.advance(1);
  key(code, false);
}
function pointer(
  type: string,
  x: number,
  y: number,
  device = "mouse",
  id = 1,
): void {
  const event = new Event(type);
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: id,
    pointerType: device,
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
  events.dispatchEvent(event);
}
async function click(x: number, y: number, device = "mouse"): Promise<void> {
  pointer("pointerdown", x, y, device);
  await engine.advance(1);
  pointer("pointerup", x, y, device);
  await engine.advance(1);
}
function pose(
  fn: (s: Parameters<DeepcoreDebugApi["reset"]>[0]) => DeepcoreState,
): void {
  engine.apply(fn);
}
const snap = () => engine.debug.snapshot(engine.state);
function mine(): void {
  pose((s) => engine.debug.setScreen(s, "in-mine"));
}
function floor(
  col = 4,
  row = 2,
  kind: "rock" | "lava" | "gas" | "stone" = "rock",
): void {
  pose((s) => engine.debug.setTile(s, col, row, kind));
  pose((s) =>
    engine.debug.setMinerPosition(
      s,
      col * C.TILE + 12,
      row * C.TILE - C.MINER_H,
    ),
  );
}

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", async (url: string) => {
    const path = decodeURIComponent(url.split("?")[0]).replace(/^\//, "");
    const data = await readFile(new URL(`../${path}`, import.meta.url));
    return new Response(data);
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(data: ArrayBuffer) {
        expect(Buffer.from(data).toString("ascii", 0, 4)).toBe("RIFF");
        return { duration: data.byteLength / 44100 };
      }
    },
  );
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  vi.stubGlobal("ImageBitmap", Image);
  vi.stubGlobal("OffscreenCanvas", canvas.constructor);
  const boot = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => new EventTarget(),
    },
  });
  const failed: string[] = [];
  boot.events.on("asset:failed", (e) => failed.push(e.reason));
  await boot.initialize();
  expect(failed).toEqual([]);
  assets = boot.state.assets as Assets;
  expect(Object.keys(assets.images).length).toBeGreaterThan(90);
  expect(Object.keys(assets.systems)).toHaveLength(12);
  boot.destroy();
});
beforeEach(async () => {
  engine?.destroy();
  storage.values.clear();
  activeKeys.clear();
  renderFrames = false;
  events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: "#0b1720",
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
    game: {
      ...game,
      render(s, api) {
        if (renderFrames) game.render(s, api);
      },
      initialize(api) {
        for (const name of C.ACTION_NAMES)
          api.input.register(name, { keys: [...C.ACTIONS[name]] });
        for (const name of Object.values(C.CUES))
          api.audio.define(name, { freq: 200, durationMs: 10 });
        return [initial(assets), debugApi];
      },
    },
  });
  await engine.initialize();
});
afterAll(() => {
  engine.destroy();
  vi.unstubAllGlobals();
});

describe("expedition navigation and the engine contract", () => {
  it("renders all menus and panels into engine recordings with real sprite assets", async () => {
    renderFrames = true;
    engine.startRecording();
    for (const screen of C.SCREENS) {
      pose((s) => engine.debug.setScreen(s, screen));
      await engine.advance(1);
    }
    mine();
    floor(4, 1);
    pose((s) => engine.debug.setCredits(s, 50000));
    pose((s) => engine.debug.setCargo(s, "ferron", 3));
    for (const panel of C.PANELS) {
      pose((s) => engine.debug.setPanel(s, panel));
      await engine.advance(1);
      const r = engine.debug.controlRect(engine.state, "pause", null);
      expect(r?.x).toBeGreaterThanOrEqual(0);
    }
    const recording = engine.stopRecording();
    expect(recording.frames.length).toBe(C.SCREENS.length + C.PANELS.length);
    expect(recording.images.length).toBeGreaterThan(10);
    expect(recording.frames.every((f) => !f.truncated)).toBe(true);
    const state = engine.state,
      before = engine.debug.snapshot(state),
      canvas = createCanvas(C.STAGE_W, C.STAGE_H);
    game.render(state, {
      ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      frame: () => engine.frame(),
      viewport: () => engine.viewport(),
    });
    expect(engine.debug.snapshot(state)).toEqual(before);
  });
  it("begins at title, chooses mode and size with real action edges", async () => {
    expect(snap().screen).toBe("title");
    await tap("Enter");
    expect(snap().screen).toBe("mode-select");
    await tap("ArrowDown");
    await tap("Enter");
    expect(snap().mode).toBe("hardcore");
    await tap("Enter");
    expect(snap().screen).toBe("in-mine");
    expect(snap().coreRow).toBe(250);
    expect(snap().miner.fuel).toBe(100);
  });
  it("requires both pointer edges in the same menu item", async () => {
    const rect = engine.debug.menuItemRect(engine.state, 0)!;
    pointer("pointerdown", rect.x + 10, rect.y + 10);
    await engine.advance(1);
    pointer("pointerup", 10, 10);
    await engine.advance(1);
    expect(snap().screen).toBe("title");
    await click(rect.x + 10, rect.y + 10, "touch");
    expect(snap().screen).toBe("mode-select");
  });
  it("returns to the entry that led to a submenu", async () => {
    await tap("ArrowDown");
    await tap("Enter");
    expect(snap().screen).toBe("how-to-play");
    await tap("Escape");
    expect(snap().menuIndex).toBe(1);
    await tap("ArrowUp");
    await tap("Enter");
    await tap("Enter");
    await tap("Escape");
    expect(snap().screen).toBe("mode-select");
    expect(snap().menuIndex).toBe(0);
  });
  it("pauses the expedition clock and quits from the pause menu", async () => {
    mine();
    floor();
    await engine.advance(30);
    await tap("Escape");
    const time = snap().elapsedSeconds;
    await engine.advance(90);
    expect(snap().elapsedSeconds).toBe(time);
    expect(snap().simTime).toBeGreaterThan(time);
    await tap("ArrowDown");
    await tap("ArrowDown");
    await tap("Enter");
    expect(snap().screen).toBe("title");
  });
  it("muting mirrors engine audio, and immutable transitions retain prior frames", async () => {
    const previous = engine.state;
    await tap("KeyM");
    expect(snap().muted).toBe(true);
    expect(previous.muted).toBe(false);
    expect(previous.simTime).toBe(0);
  });
});

describe("drilling, motion and weight", () => {
  it("can arrest a half-finished bore and thrust back through its carved upper face", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setTile(s, 4, 3, "rock"));
    key("KeyS");
    await engine.advance(17);
    key("KeyS", false);
    const halfway = snap().miner.y;
    await engine.advance(12);
    expect(snap().miner.y).toBeCloseTo(halfway, 6);
    expect(snap().miner.grounded).toBe(true);
    key("Space");
    await engine.advance(20);
    key("Space", false);
    expect(snap().miner.y).toBeLessThan(halfway - 40);
    expect(engine.debug.tileAt(engine.state, 4, 2).health).toBe(2);
  });
  it("ramps camera lead with travel time and unwinds it four times faster", async () => {
    mine();
    floor(16, 100);
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setMinerVelocity(s, 0, 1000));
    await engine.advance(120);
    expect(snap().camera.lead).toBeCloseTo(C.CAM_LEAD_MAX, 7);
    expect(snap().camera.x).toBeCloseTo(
      snap().miner.x + C.MINER_W / 2 - C.VIEW_W / 2,
      7,
    );
    pose((s) => engine.debug.setMinerVelocity(s, 0, 0));
    await engine.advance(30);
    expect(snap().camera.lead).toBeCloseTo(0, 7);
  });
  it("gates travel and drilling independently while life support keeps burning", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setMinerDrill(s, false));
    pose((s) => engine.debug.setMinerVelocity(s, 30, 40));
    const before = snap().miner;
    key("KeyS");
    await engine.advance(30);
    expect(snap().miner.y).toBe(before.y);
    expect(snap().miner.vy).toBe(40);
    expect(engine.debug.tileAt(engine.state, 4, 2).health).toBe(4);
    expect(snap().miner.fuel).toBeCloseTo(100 - 0.5 * C.LIFE_SUPPORT_BURN, 7);
    pose((s) => engine.debug.setMinerDrill(s, true));
    await engine.advance(30);
    key("KeyS", false);
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("tunnel");
    expect(snap().miner.y).toBe(before.y);
  });
  it("clears ore without adding cargo when every slot is occupied", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setCargo(s, "ferron", C.CARGO_TIERS[0]));
    pose((s) => engine.debug.setOreTile(s, 4, 2, "cuprite"));
    key("KeyS");
    await engine.advance(30);
    key("KeyS", false);
    expect(snap().cargo.slotsUsed).toBe(C.CARGO_TIERS[0]);
    expect(snap().cargo.ore.cuprite).toBeUndefined();
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("tunnel");
  });
  it("breaks a topsoil cell in four hits, spending fuel and collecting ore", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setOreTile(s, 4, 2, "ferron"));
    const prior = engine.state;
    key("KeyS");
    await engine.advance(29);
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("ore");
    await engine.advance(1);
    key("KeyS", false);
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("tunnel");
    expect(snap().cargo.ore).toEqual({ ferron: 1 });
    expect(snap().miner.fuel).toBeCloseTo(99 - 0.5 * C.LIFE_SUPPORT_BURN, 5);
    expect(prior.grid[2 * C.WORLD_COLS + 4].health).toBe(4);
  });
  it("preserves partial damage and resumes a cut", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setMinerTravel(s, false));
    key("KeyS");
    await engine.advance(15);
    key("KeyS", false);
    await engine.advance(1);
    expect(engine.debug.tileAt(engine.state, 4, 2).health).toBe(2);
    await engine.advance(20);
    key("KeyS");
    await engine.advance(15);
    key("KeyS", false);
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("tunnel");
  });
  it("sinks through a held cut and arrives flush on the next tile", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setTile(s, 4, 3, "rock"));
    key("KeyS");
    await engine.advance(15);
    const y = snap().miner.y;
    expect(y).toBeGreaterThan(2 * C.TILE - C.MINER_H);
    expect(y).toBeLessThan(3 * C.TILE - C.MINER_H);
    await engine.advance(15);
    key("KeyS", false);
    expect(snap().miner.y).toBeCloseTo(3 * C.TILE - C.MINER_H, 3);
  });
  it("walks to the wall before starting a grounded side cut", async () => {
    mine();
    for (const col of [4, 5])
      pose((s) => engine.debug.setTile(s, col, 2, "rock"));
    pose((s) => engine.debug.setTile(s, 5, 1, "rock"));
    pose((s) =>
      engine.debug.setMinerPosition(s, 4 * C.TILE, 2 * C.TILE - C.MINER_H),
    );
    key("KeyD");
    await engine.advance(3);
    expect(engine.debug.tileAt(engine.state, 5, 1).health).toBe(4);
    await engine.advance(40);
    key("KeyD", false);
    expect(engine.debug.tileAt(engine.state, 5, 1).kind).toBe("tunnel");
  });
  it("does not drill in free fall or through stone", async () => {
    mine();
    pose((s) => engine.debug.setTile(s, 5, 4, "rock"));
    pose((s) => engine.debug.setMinerPosition(s, 4 * C.TILE + 24, 3 * C.TILE));
    key("KeyD");
    await engine.advance(10);
    key("KeyD", false);
    expect(engine.debug.tileAt(engine.state, 5, 4).health).toBe(4);
    floor(4, 2, "stone");
    pose((s) => engine.debug.setMinerTravel(s, false));
    key("KeyS");
    await engine.advance(60);
    key("KeyS", false);
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("stone");
    expect(snap().miner.drilling).toBeNull();
  });
  it("has an overload wall that dropping ore resolves", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setCargo(s, "adamite", 5));
    key("Space");
    await engine.advance(20);
    expect(snap().miner.y).toBe(2 * C.TILE - C.MINER_H);
    expect(snap().miner.overloaded).toBe(true);
    pose((s) => engine.debug.dropOre(s, "adamite"));
    await engine.advance(30);
    key("Space", false);
    expect(snap().miner.overloaded).toBe(false);
    expect(snap().miner.y).toBeLessThan(2 * C.TILE - C.MINER_H);
  });
  it("spends no fuel falling in the sky and does not refill on the surface", async () => {
    mine();
    pose((s) => engine.debug.setFuel(s, 40));
    pose((s) => engine.debug.setMinerPosition(s, -20, -300));
    await engine.advance(10);
    expect(snap().miner.x).toBe(0);
    expect(snap().miner.fuel).toBe(40);
    floor(4, 1);
    await engine.advance(60);
    expect(snap().miner.fuel).toBe(40);
  });
  it("gives the same simulation result with 30 and 120 Hz frame partitions", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setTile(s, 4, 3, "rock"));
    const initialState = engine.state;
    key("KeyS");
    engine.setClock(new ConstantClock(1000 / 30));
    await engine.advance(15);
    const a = snap();
    engine.apply(
      () =>
        ({
          ...initialState,
          grid: initialState.grid.slice() as DeepcoreState["grid"],
          assets,
        }) as DeepcoreState,
    );
    engine.setClock(new ConstantClock(1000 / 120));
    await engine.advance(60);
    const b = snap();
    key("KeyS", false);
    expect(b.miner.y).toBeCloseTo(a.miner.y, 8);
    expect(b.miner.fuel).toBeCloseTo(a.miner.fuel, 8);
    expect(b.elapsedSeconds).toBeCloseTo(a.elapsedSeconds, 8);
  });
});

describe("hazards and Core Sample", () => {
  it("a drilled gas pocket shoves a travelling miner away rather than cancelling recoil", async () => {
    mine();
    floor(4, 160, "gas");
    pose((s) => engine.debug.setHull(s, 500));
    key("KeyS");
    await engine.advance(60);
    key("KeyS", false);
    expect(snap().miner.vy).toBeLessThan(-600);
    expect(snap().miner.y).toBeLessThan(160 * C.TILE - C.MINER_H);
  });
  it("resolves gas damage, knockback, effect, sound and a delayed notice", async () => {
    mine();
    floor(4, 160, "gas");
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setHull(s, 500));
    const sounds: string[] = [];
    engine.events.on("cue:played", (e) => sounds.push(e.cue));
    key("KeyS");
    await engine.advance(60);
    key("KeyS", false);
    expect(snap().miner.hull).toBeLessThan(500);
    expect(snap().noticesFired.gas).toBe(true);
    expect(snap().notice?.shown).toBe(false);
    expect(sounds).toContain(C.CUES.gasExplosion);
    await engine.advance(90);
    expect(snap().notice?.shown).toBe(true);
    pose((s) => engine.debug.dismissNotice(s));
    expect(snap().notice).toBeNull();
  });
  it("radiators reduce lava drill burns but do not protect against gas", async () => {
    mine();
    floor(4, 300, "lava");
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setTier(s, "radiator", 5));
    pose((s) => engine.debug.setTier(s, "drill", 5));
    key("KeyS");
    await engine.advance(23);
    key("KeyS", false);
    expect(snap().miner.hull).toBeCloseTo(
      100 - C.LAVA_DRILL_DEEPSTONE * 0.2,
      5,
    );
  });
  it("applies impact damage from the actual landing speed", async () => {
    mine();
    floor();
    pose((s) =>
      engine.debug.setMinerPosition(
        s,
        4 * C.TILE + 12,
        2 * C.TILE - C.MINER_H - 20,
      ),
    );
    pose((s) => engine.debug.setMinerVelocity(s, 0, 800));
    await engine.advance(3);
    expect(snap().miner.hull).toBeLessThan(90);
    expect(snap().miner.grounded).toBe(true);
  });
  it("ends immediately when hull is empty, even with a panel open", async () => {
    mine();
    pose((s) => engine.debug.setPanel(s, "inventory"));
    pose((s) => engine.debug.setHull(s, 0));
    await engine.advance(1);
    expect(snap().screen).toBe("game-over");
    expect(snap().summary?.deathCause).toBe("hull-destroyed");
  });
  it("fuel-out below ground is a death", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setFuel(s, 0.001));
    await engine.advance(1);
    expect(snap().screen).toBe("game-over");
    expect(snap().summary?.deathCause).toBe("fuel-out");
  });
  it("extracts one live sample from the inexhaustible Core", async () => {
    mine();
    floor(16, 500);
    pose((s) => engine.debug.setTile(s, 16, 500, "core"));
    pose((s) => engine.debug.setMinerTravel(s, false));
    key("KeyS");
    await engine.advance(15);
    key("KeyS", false);
    expect(snap().satchel.coreSample).toBe(true);
    expect(snap().coreTimer).toBeGreaterThan(89);
    expect(engine.debug.tileAt(engine.state, 16, 500).kind).toBe("core");
    expect(() => engine.debug.setCoreCarried(engine.state, true)).toThrow();
  });
  it("counts down inside inventory, freezes on pause, then detonates", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setCoreCarried(s, true));
    pose((s) => engine.debug.setCoreTimer(s, 2));
    pose((s) => engine.debug.setPanel(s, "inventory"));
    await engine.advance(30);
    expect(snap().coreTimer).toBeCloseTo(1.5, 4);
    await tap("Escape");
    await tap("Escape");
    const t = snap().coreTimer;
    await engine.advance(60);
    expect(snap().coreTimer).toBe(t);
    await tap("Escape");
    await engine.advance(100);
    expect(snap().summary?.deathCause).toBe("core-detonation");
  });
  it("jettisons without resetting the timer and survives outside the blast", async () => {
    mine();
    floor();
    pose((s) => engine.debug.setMinerTravel(s, false));
    pose((s) => engine.debug.setCoreCarried(s, true));
    pose((s) => engine.debug.setCoreTimer(s, 0.3));
    pose((s) => engine.debug.jettison(s));
    expect(snap().coreTimer).toBe(0.3);
    expect(snap().coreGround).toEqual({ col: 4, row: 1 });
    pose((s) => engine.debug.setMinerPosition(s, 15 * C.TILE, 0));
    await engine.advance(30);
    expect(snap().screen).toBe("in-mine");
    expect(snap().coreGround).toBeNull();
    expect(snap().coreTimer).toBeNull();
  });
});

describe("economy, supplies, rocket and saves", () => {
  it("sells the whole haul and buys only affordable missing fuel", () => {
    pose((s) => engine.debug.setCargo(s, "ferron", 3));
    pose((s) => engine.debug.setCargo(s, "marlite", 2));
    pose((s) => engine.debug.sell(s));
    expect(snap().credits).toBe(176);
    expect(snap().cargo.slotsUsed).toBe(0);
    pose((s) => engine.debug.setFuel(s, 90));
    pose((s) => engine.debug.buyFuel(s));
    expect(snap().credits).toBe(166);
    expect(snap().miner.fuel).toBe(100);
    pose((s) => engine.debug.setFuel(s, 0));
    pose((s) => engine.debug.setCredits(s, 7));
    pose((s) => engine.debug.fillFuel(s));
    expect(snap().miner.fuel).toBe(7);
    expect(snap().credits).toBe(0);
  });
  it("upgrades capacity by the difference without refilling the tank", () => {
    pose((s) => engine.debug.setFuel(s, 30));
    pose((s) => engine.debug.setCredits(s, 300));
    pose((s) => engine.debug.buyUpgrade(s, "fuel"));
    expect(snap().miner.fuel).toBe(105);
    expect(snap().miner.maxFuel).toBe(175);
    expect(snap().credits).toBe(0);
  });
  it("blasts boulders and ore, preserving material nodes and the Core", () => {
    mine();
    floor();
    pose((s) => engine.debug.setItemCount(s, "dynamite", 1));
    pose((s) => engine.debug.setTile(s, 3, 2, "stone"));
    pose((s) => engine.debug.setOreTile(s, 5, 2, "ferron"));
    pose((s) => engine.debug.setMaterialTile(s, 4, 2, "resonite"));
    pose((s) => engine.debug.useItem(s, "dynamite"));
    expect(engine.debug.tileAt(engine.state, 3, 2).kind).toBe("tunnel");
    expect(engine.debug.tileAt(engine.state, 5, 2).kind).toBe("tunnel");
    expect(engine.debug.tileAt(engine.state, 4, 2).kind).toBe("material");
    expect(snap().cargo.slotsUsed).toBe(0);
    expect(snap().items.dynamite).toBe(0);
  });
  it("consumes posed quantum outcomes once and lets physics handle the fall", async () => {
    mine();
    floor(4, 1);
    pose((s) => engine.debug.setItemCount(s, "quantum-teleporter", 1));
    pose((s) => engine.debug.setNextTeleportHeight(s, 8));
    pose((s) => engine.debug.setNextTeleportSpeed(s, 700));
    pose((s) => engine.debug.useItem(s, "quantum-teleporter"));
    expect(snap().miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(snap().miner.vy).toBe(700);
    expect(snap().nextTeleportSpeed).toBeNull();
    expect(snap().nextTeleportHeight).toBeNull();
    await engine.advance(60);
    expect(snap().miner.hull).toBeLessThan(100);
  });
  it("does not consume repair supplies when already full", () => {
    pose((s) => engine.debug.setItemCount(s, "nanobots", 1));
    pose((s) => engine.debug.useItem(s, "nanobots"));
    expect(snap().items.nanobots).toBe(1);
    pose((s) => engine.debug.setHull(s, 80));
    pose((s) => engine.debug.useItem(s, "nanobots"));
    expect(snap().miner.hull).toBe(100);
    expect(snap().items.nanobots).toBe(0);
  });
  it("builds the five-component rocket and wins only by launching", async () => {
    mine();
    floor(4, 1);
    pose((s) => engine.debug.setCredits(s, C.ROCKET_TOTAL_CREDITS));
    pose((s) => engine.debug.setMaterial(s, "resonite", 1));
    pose((s) => engine.debug.setMaterial(s, "cryenite", 1));
    pose((s) => engine.debug.setCoreCarried(s, true));
    for (let i = 0; i < 5; i++) pose((s) => engine.debug.fabricate(s));
    expect(snap().rocket.installed).toHaveLength(5);
    expect(snap().coreTimer).toBeNull();
    expect(snap().credits).toBe(0);
    pose((s) => engine.debug.launch(s));
    expect(snap().screen).toBe("in-mine");
    await engine.advance(220);
    expect(snap().screen).toBe("victory");
    expect(snap().summary?.componentsInstalled).toBe(5);
  });
  it("saves the mine and restores a Standard expedition after death", async () => {
    mine();
    floor(4, 1);
    pose((s) => engine.debug.setCredits(s, 999));
    pose((s) => engine.debug.setOreTile(s, 8, 12, "marlite"));
    pose((s) => engine.debug.save(s));
    expect(snap().hasSave).toBe(true);
    pose((s) => engine.debug.setCredits(s, 0));
    pose((s) => engine.debug.setHull(s, 0));
    await engine.advance(1);
    expect(snap().hasSave).toBe(true);
    await tap("Enter");
    expect(snap().screen).toBe("in-mine");
    expect(snap().credits).toBe(999);
    expect(engine.debug.tileAt(engine.state, 8, 12).ore).toBe("marlite");
  });
  it("refuses live-sample saves and erases a Hardcore save on death", async () => {
    mine();
    floor(4, 1);
    pose((s) => engine.debug.setCoreCarried(s, true));
    pose((s) => engine.debug.save(s));
    expect(snap().hasSave).toBe(false);
    pose((s) => engine.debug.setCoreCarried(s, false));
    pose((s) => engine.debug.setMode(s, "hardcore"));
    pose((s) => engine.debug.save(s));
    expect(snap().hasSave).toBe(true);
    pose((s) => engine.debug.setHull(s, 0));
    await engine.advance(1);
    expect(snap().hasSave).toBe(false);
  });
});

describe("generation and pure automation poses", () => {
  it.each(C.WORLD_SIZES)(
    "generates complete %s bands and exactly one of each exotic node",
    (size) => {
      const s = engine.debug.setWorldSize(engine.state, size);
      generate(s);
      const nodes = C.MATERIALS.map((m) =>
        s.grid.filter((t) => t.material === m),
      );
      expect(nodes.map((a) => a.length)).toEqual([1, 1]);
      for (const band of C.BANDS) {
        const cells = s.grid.filter(
            (t) => t.band === band && t.kind !== "bedrock",
          ),
          ore = cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(ore).toBeGreaterThan(C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE));
        expect(ore).toBeLessThan(C.ORE_DENSITY * (1 + C.DENSITY_TOLERANCE));
      }
      expect(engine.debug.tileAt(s, 16, s.coreRow).kind).toBe("core");
      expect(engine.debug.tileAt(s, 26, 1).kind).toBe("tunnel");
      const seen = new Set<number>(),
        queue = [C.WORLD_COLS + C.CAVE_MOUTH_COL];
      while (queue.length) {
        const i = queue.pop()!;
        if (seen.has(i)) continue;
        const t = s.grid[i];
        if (!t || ["stone", "lava", "bedrock"].includes(t.kind)) continue;
        seen.add(i);
        const col = i % C.WORLD_COLS;
        if (col > 0) queue.push(i - 1);
        if (col < C.WORLD_COLS - 1) queue.push(i + 1);
        if (i >= C.WORLD_COLS) queue.push(i - C.WORLD_COLS);
        if (i < s.grid.length - C.WORLD_COLS) queue.push(i + C.WORLD_COLS);
      }
      s.grid.forEach((t, i) => {
        if (t.material || t.kind === "core") expect(seen.has(i)).toBe(true);
      });
    },
  );
  it("retains existing cell bands and partial health when the mine is resized", () => {
    pose((s) => engine.debug.setTile(s, 6, 200, "rock"));
    pose((s) => engine.debug.setTileHealth(s, 6, 200, 3));
    pose((s) => engine.debug.setWorldSize(s, "quick"));
    expect(engine.debug.tileAt(engine.state, 6, 200)).toMatchObject({
      band: "rockbed",
      health: 3,
      maxHealth: 8,
    });
    pose((s) => engine.debug.setWorldSize(s, "marathon"));
    expect(engine.debug.tileAt(engine.state, 16, 250).kind).toBe("tunnel");
    expect(engine.debug.tileAt(engine.state, 16, 1000).kind).toBe("core");
    expect(engine.debug.tileAt(engine.state, 6, 200).health).toBe(3);
  });
  it("reconciles derived readings without running clocks or systems", () => {
    pose((s) => engine.debug.setCargo(s, "aurite", 4));
    pose((s) => engine.debug.setFuel(s, 999));
    pose((s) => engine.debug.setMinerPosition(s, 4 * C.TILE, 1000));
    const before = snap();
    pose((s) => engine.debug.reconcile(s));
    expect(snap()).toEqual(before);
    expect(snap().cargo.loadKg).toBe(464);
    expect(snap().miner.overloaded).toBe(true);
    expect(snap().miner.fuel).toBe(999);
    expect(snap().deepestDepthMeters).toBe(0);
  });
  it("locks the scanner only onto needed nodes in range", () => {
    pose((s) => engine.debug.setMaterialTile(s, 5, 5, "resonite"));
    pose((s) => engine.debug.setTier(s, "scanner", 2));
    pose((s) => engine.debug.setMinerPosition(s, 4 * C.TILE, 4 * C.TILE));
    expect(snap().scanner).toMatchObject({ locked: true, target: "resonite" });
    pose((s) => engine.debug.setMaterial(s, "resonite", 1));
    expect(snap().scanner.locked).toBe(false);
  });
  it("rejects invalid poses loudly", () => {
    expect(() => engine.debug.setTier(engine.state, "fuel", 6)).toThrow();
    expect(() => engine.debug.setTile(engine.state, 32, 1, "rock")).toThrow();
    expect(() => engine.debug.setCoreTimer(engine.state, 20)).toThrow();
    expect(() => engine.debug.setFuel(engine.state, NaN)).toThrow();
    expect(() => engine.debug.setTileHealth(engine.state, 2, 2, 1)).toThrow();
  });
});
