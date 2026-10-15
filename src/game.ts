import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  copy,
  initial,
  snapshot,
  type DeepcoreState,
  type StateView,
} from "./model";
import { debugApi, hasSave, type DeepcoreDebugApi } from "./debug";
import { contains, controls, menuItems, menuRect } from "./layout";
import { checkDeath, cue, note, resume, start, transact } from "./operations";
import { followCamera, step } from "./simulation";
import { buildings } from "./world";
import { render } from "./presentation";

export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#0b1720";

const imageUrls = import.meta.glob<string>(
  [
    "../assets/miner/**/*.png",
    "../assets/tiles/**/*.png",
    "../assets/hazards/**/*.png",
    "../assets/ore/*.png",
    "../assets/materials/*.png",
    "../assets/surface/*.png",
    "../assets/rocket/*.png",
    "../assets/icons/*.png",
  ],
  { eager: true, query: "?url&no-inline", import: "default" },
);
const effectUrls = import.meta.glob<string>("../assets/fx/*.json", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const audioUrls = import.meta.glob<string>("../assets/audio/*.wav", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
/** The engine resolves under its document-relative assets root, including on subpaths. */
function loaderPath(url: string): string {
  const marker = url.lastIndexOf("/assets/");
  return marker >= 0 ? url.slice(marker + 8) : url.replace(/^\.\//, "");
}

async function initialize(
  api: InitApi<DeepcoreState>,
): Promise<[DeepcoreState, DeepcoreDebugApi]> {
  for (const name of C.ACTION_NAMES)
    api.input.register(name, { keys: [...C.ACTIONS[name]] });
  const images: DeepcoreState["assets"]["images"] = {},
    systems: Record<string, ParticleSystem> = {};
  await Promise.all([
    ...Object.entries(imageUrls).map(async ([key, url]) => {
      images[key.replace("../assets/", "")] = await api.assets.loadImage(
        loaderPath(url),
      );
    }),
    ...Object.entries(effectUrls).map(async ([key, url]) => {
      const blob = await api.assets.load(loaderPath(url));
      systems[key.split("/").pop()!.replace(".json", "")] = JSON.parse(
        await blob.text(),
      ) as ParticleSystem;
    }),
    ...Object.entries(audioUrls).map(async ([key, url]) => {
      const name = key.split("/").pop()!.replace(".wav", "");
      await api.audio.load(name, loaderPath(url));
    }),
  ]);
  const s = initial({ images, systems });
  s.hasSave = hasSave();
  const readings: Record<string, (s: StateView) => string> = {
    "Screen / panel": (s) => `${s.screen} / ${s.panel ?? "—"}`,
    Expedition: (s) => `${s.mode} · ${s.worldSize}`,
    Position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
    Velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
    Prospector: (s) =>
      `${s.miner.state} · ${s.miner.facing} · grounded ${snapshot(s).miner.grounded}`,
    "Fuel / hull": (s) => {
      const m = snapshot(s).miner;
      return `${m.fuel.toFixed(1)}/${m.maxFuel} · ${m.hull.toFixed(1)}/${m.maxHull}`;
    },
    Drill: (s) => {
      const d = snapshot(s).miner.drilling;
      return d ? `${d.col},${d.row} ${Math.round(d.progress * 100)}%` : "—";
    },
    "Credits / depth": (s) =>
      `${s.credits.toFixed(0)} CR · ${snapshot(s).depthMeters.toFixed(1)} m`,
    Cargo: (s) => {
      const c = snapshot(s).cargo;
      return `${c.slotsUsed}/${c.slotCap} · ${c.loadKg} kg · overload ${c.loadKg >= c.liftLimitKg}`;
    },
    Satchel: (s) =>
      `R ${s.satchel.resonite} · C ${s.satchel.cryenite} · Core ${s.satchel.coreSample}`,
    "Upgrade tiers": (s) =>
      C.TRACKS.map((t) => `${t} ${s.tiers[t]}`).join(" · "),
    "Core timer": (s) =>
      s.coreTimer === null ? "—" : `${s.coreTimer.toFixed(2)} s`,
    Scanner: (s) => {
      const scan = snapshot(s).scanner;
      return `${scan.locked} · ${scan.target ?? "—"}`;
    },
  };
  for (const [name, reader] of Object.entries(readings))
    api.diagnostics.register(name, reader);
  return [s, debugApi];
}

function back(s: DeepcoreState): void {
  const screen = s.screen;
  if (screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
    return;
  }
  if (screen === "size-select") {
    s.screen = "mode-select";
    s.menuIndex = C.MODES.indexOf(s.mode);
    return;
  }
  s.screen = "title";
  s.menuIndex = menuItems(s).indexOf(
    screen === "how-to-play" ? C.TITLE_ITEMS[2] : C.TITLE_ITEMS[1],
  );
}
function choose(s: DeepcoreState, index: number): DeepcoreState {
  const item = menuItems(s)[index];
  cue(s, C.CUES.fabricate);
  switch (s.screen) {
    case "title":
      if (item === C.TITLE_ITEMS[0]) return resume(s);
      s.screen = item === C.TITLE_ITEMS[1] ? "mode-select" : "how-to-play";
      break;
    case "mode-select":
      if (index === 2) back(s);
      else {
        s.mode = C.MODES[index];
        s.screen = "size-select";
        s.menuIndex = 0;
      }
      return s;
    case "size-select":
      if (index === 3) back(s);
      else {
        s.worldSize = C.WORLD_SIZES[index];
        return start(s);
      }
      return s;
    case "how-to-play":
      back(s);
      return s;
    case "paused":
      if (index === 0) s.screen = "in-mine";
      else if (index === 1) return start(s);
      else {
        s.screen = "title";
        s.menuIndex = menuItems(s).indexOf(C.TITLE_ITEMS[1]);
      }
      return s;
    case "victory":
    case "game-over":
      if (index === 1) {
        back(s);
        return s;
      }
      if (item === C.GAME_OVER_SAVE_ITEMS[0]) return resume(s);
      return start(s);
  }
  s.menuIndex = 0;
  return s;
}
function targetAt(s: StateView, x: number, y: number): string | null {
  for (let i = 0; i < menuItems(s).length; i++) {
    const r = menuRect(s, i);
    if (r && contains(r, x, y)) return `menu:${i}`;
  }
  for (const c of controls(s))
    if (c.enabled && contains(c, x, y)) return `${c.id}:${c.subject ?? ""}`;
  if (s.screen === "in-mine" && !s.panel && y > C.HUD_H) {
    const wx = x + s.camera.x,
      wy = y - C.HUD_H + s.camera.y;
    const b = buildings.find((b) => contains(b, wx, wy));
    if (
      b &&
      Math.abs(s.miner.x + C.MINER_W / 2 - (b.x + b.w / 2)) < b.w / 2 + 65 &&
      Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) <= 2
    )
      return `building:${b.id}`;
  }
  return null;
}
function activateBuilding(s: DeepcoreState, id: C.BuildingId): void {
  if (id === "save-pad") transact(s, "save");
  else {
    s.panel = id;
    s.panelFocus = 0;
  }
}

function update(state: StateView, api: UpdateApi, dt: number): DeepcoreState {
  let s = copy(state);
  s.simTime += dt;
  const pressed = Object.fromEntries(
    C.ACTION_NAMES.map((name) => [name, api.input.pressed(name)]),
  ) as Record<C.ActionName, boolean>;
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  for (const sample of api.input.pointerSamples()) {
    const target = targetAt(s, sample.x, sample.y);
    if (
      target?.startsWith("menu:") &&
      (sample.type === "move" || sample.type === "down")
    )
      s.menuIndex = Number(target.split(":")[1]);
    if (sample.type === "down") {
      if (target) s.pointerDown[sample.id] = target;
      if (target?.startsWith("dismiss-notice")) transact(s, "dismiss-notice");
    }
    if (sample.type === "up") {
      if (target && s.pointerDown[sample.id] === target) {
        const [id, subject] = target.split(":");
        if (id === "menu") s = choose(s, Number(subject));
        else if (id === "building")
          activateBuilding(s, subject as C.BuildingId);
        else if (id === "mute") {
          api.audio.setMuted(!api.audio.muted());
          s.muted = api.audio.muted();
        } else transact(s, id, subject || null);
      }
      delete s.pointerDown[sample.id];
    }
  }
  if (s.screen !== "in-mine") {
    const count = menuItems(s).length;
    if (pressed.down) s.menuIndex = (s.menuIndex + 1) % count;
    if (pressed.up) s.menuIndex = (s.menuIndex + count - 1) % count;
    if (
      pressed.pause &&
      ["paused", "mode-select", "size-select", "how-to-play"].includes(s.screen)
    )
      back(s);
    else if (pressed.activate) s = choose(s, s.menuIndex);
  } else {
    if (pressed.pause) transact(s, "pause");
    if (pressed.inventory) transact(s, "inventory");
    if (pressed.jettison) transact(s, "jettison");
    C.ITEM_IDS.forEach((id, i) => {
      if (pressed[`supply${i + 1}` as C.ActionName])
        transact(s, "use-item", id);
    });
    if (s.panel) {
      const options = controls(s).filter(
        (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
      );
      if (options.length) {
        if (pressed.down || pressed.right)
          s.panelFocus = ((s.panelFocus ?? 0) + 1) % options.length;
        if (pressed.up || pressed.left)
          s.panelFocus =
            ((s.panelFocus ?? 0) + options.length - 1) % options.length;
      }
    }
    if (pressed.activate) {
      if (s.panel) {
        const options = controls(s).filter(
          (c) =>
            !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
        );
        const c = options[(s.panelFocus ?? 0) % options.length];
        if (c?.enabled) transact(s, c.id, c.subject);
      } else if (Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) <= 2) {
        const b = buildings.find(
          (b) =>
            Math.abs(s.miner.x + C.MINER_W / 2 - b.x - b.w / 2) < b.w / 2 + 65,
        );
        if (b) activateBuilding(s, b.id);
        else note(s, "Walk to a station · [E] to interact");
      }
    }
  }
  if (s.screen === "in-mine") {
    checkDeath(s);
    const held = {
      left: api.input.value("left"),
      right: api.input.value("right"),
      down: api.input.value("down"),
      up: api.input.value("up"),
    };
    s.accumulator += dt;
    const fixed = 1 / 120;
    while (s.accumulator + 1e-9 >= fixed) {
      step(s, held, fixed);
      s.accumulator -= fixed;
    }
    followCamera(s, 0);
  }
  const animated = s.screen !== "paused";
  if (animated) {
    s.effects = s.effects
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter(
        (e) =>
          e.age <
          Math.min(
            2.2,
            Math.max(
              ...(s.assets.systems[e.name]?.emitters.map(
                (em) => (em.lifetimeMs + (em.lifetimeSpread ?? 0)) / 1000,
              ) ?? [2.2]),
            ),
          ),
      );
    s.noteTime = Math.max(0, s.noteTime - dt);
    s.shake = Math.max(0, s.shake - dt * 18);
  }
  for (const sound of s.cues ?? []) api.audio.play(sound);
  s.cues = [];
  api.audio.loop(C.CUES.music);
  const cutting =
    s.screen === "in-mine" &&
    s.launchTime === null &&
    !s.panel &&
    s.miner.drilling !== null;
  const thrust =
    s.screen === "in-mine" &&
    s.launchTime === null &&
    !s.panel &&
    s.miner.state === "jetpack";
  if (cutting) api.audio.loop(C.CUES.drill);
  else api.audio.stop(C.CUES.drill);
  if (thrust) api.audio.loop(C.CUES.thrust);
  else api.audio.stop(C.CUES.thrust);
  return s;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  initialize,
  update,
  render,
};
