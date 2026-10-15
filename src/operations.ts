import * as C from "./constants";
import {
  cargo,
  cell,
  copy,
  depth,
  initial,
  maxFuel,
  maxHull,
  minerCell,
  put,
  tile,
  type DeepcoreState,
  type StateView,
} from "./model";
import { generate, resize } from "./world";
import { mineralTint } from "./palette";

const SAVE_KEY = "deepcore.expedition.v1";
export function readSave(): Omit<DeepcoreState, "assets"> | null {
  try {
    const text = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!text) return null;
    const value = JSON.parse(text) as Omit<DeepcoreState, "assets">;
    return Array.isArray(value.grid) &&
      value.tiers &&
      C.WORLD_SIZES.includes(value.worldSize)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function eraseSave(): void {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* Storage is optional. */
  }
}
export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteTime = 3;
}
export function cue(s: DeepcoreState, name: C.CueName): void {
  s.cues = [...(s.cues ?? []), name];
}
export function effect(
  s: DeepcoreState,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
  tint?: string,
): void {
  s.effects.push({ name, x, y, age: 0, seed: ++s.effectSerial, tint });
}
export function spawn(s: DeepcoreState): void {
  s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
  s.miner.y = C.SURFACE_Y - C.MINER_H;
  s.miner.vx = 0;
  s.miner.vy = 0;
  s.miner.drilling = null;
}
export function start(s: StateView): DeepcoreState {
  const n = initial(s.assets as DeepcoreState["assets"], s.muted);
  n.mode = s.mode;
  n.simTime = s.simTime;
  resize(n, s.worldSize);
  generate(n);
  n.screen = "in-mine";
  n.hasSave = false;
  eraseSave();
  note(n, "NEW EXPEDITION · Find ore. Keep enough fuel for the climb.");
  return n;
}
export function resume(s: StateView): DeepcoreState {
  const saved = readSave();
  if (!saved) return copy(s);
  const n = {
    ...initial(s.assets as DeepcoreState["assets"], s.muted),
    ...saved,
    assets: s.assets as DeepcoreState["assets"],
    screen: "in-mine" as const,
    panel: null,
    menuIndex: 0,
    hasSave: true,
    summary: null,
    muted: s.muted,
    simTime: s.simTime,
    effects: [],
    cues: [],
    pointerDown: {},
  };
  spawn(n);
  return n;
}
export function finish(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.summary || (s.launchTime !== null && cause)) return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  s.miner.drilling = null;
  if (cause) {
    s.screen = "game-over";
    effect(s, "death-burst");
    cue(s, C.CUES.death);
    if (s.mode === "hardcore") {
      eraseSave();
      s.hasSave = false;
    }
  } else {
    s.screen = "victory";
    eraseSave();
    s.hasSave = false;
  }
}
export function checkDeath(s: DeepcoreState): void {
  if (s.screen !== "in-mine" || s.launchTime !== null) return;
  if (s.miner.hull <= 0) finish(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && depth(s) > 0) finish(s, "fuel-out");
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, shown: false, age: 0 };
  }
}
export function gas(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  s.shake = 16;
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    const f = (row - 1) / (s.coreRow - 1);
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) * Math.max(0, f - 0.25)) / 0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function breakCell(
  s: DeepcoreState,
  col: number,
  row: number,
  collect = true,
): void {
  const t = tile(s, col, row),
    x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  put(s, col, row, cell("tunnel", t.band));
  if (t.kind === "gas") gas(s, col, row);
  if (t.kind === "lava" && collect) {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers", x, y);
    cue(s, C.CUES.lavaSizzle);
  }
  if (collect && t.ore) {
    if (cargo(s).slotsUsed < cargo(s).slotCap) {
      s.ore[t.ore] = (s.ore[t.ore] ?? 0) + 1;
      effect(s, "ore-sparkle", x, y, mineralTint[t.ore]);
      cue(s, C.CUES.orePickup);
      note(
        s,
        `+ ${C.MINERALS.find((m) => m.id === t.ore)?.name} · cargo secured`,
      );
    } else note(s, "cargo full · mineral lost");
  }
  if (collect && t.material) {
    s.satchel[t.material]++;
    effect(s, "material-shimmer", x, y);
    cue(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} SECURED · rocket material`);
  }
}
export function extract(s: DeepcoreState): void {
  if (s.coreTimer !== null) return;
  s.satchel.coreSample = true;
  s.coreTimer = C.CORE_TIMER;
  effect(s, "core-extract");
  cue(s, C.CUES.materialChime);
  note(s, "CORE SAMPLE UNSTABLE · Return to the Launch Pad!");
}

/** All UI and automation transactions share this single implementation. */
export function transact(
  s: DeepcoreState,
  control: string,
  subject: string | null = null,
): void {
  const paid = () => {
    cue(s, C.CUES.fabricate);
  };
  const afford = (price: number) => {
    if (s.credits + 1e-7 < price) {
      note(s, "Insufficient Credits");
      return false;
    }
    s.credits -= price;
    return true;
  };
  switch (control) {
    case "drop-ore": {
      const ore = subject as C.OreId;
      if ((s.ore[ore] ?? 0) > 0) {
        s.ore[ore]!--;
        if (!s.ore[ore]) delete s.ore[ore];
        note(s, `${subject} discarded`);
      }
      break;
    }
    case "sell": {
      const amount = cargo(s).value;
      if (amount) {
        s.credits += amount;
        s.creditsEarned += amount;
        s.ore = {};
        paid();
        note(s, `HAUL SOLD · +${amount.toLocaleString()} Credits`);
      } else note(s, "Cargo bay is empty");
      break;
    }
    case "buy-fuel":
    case "fill-fuel":
    case "buy-repair":
    case "repair-full": {
      const fuel = control.includes("fuel"),
        max = fuel ? maxFuel(s) : maxHull(s),
        held = fuel ? s.miner.fuel : s.miner.hull,
        price = fuel ? C.FUEL_PRICE : C.REPAIR_PRICE;
      const desired = Math.min(
        Math.max(0, max - held),
        control === "buy-fuel"
          ? C.FUEL_BUY_INCREMENT
          : control === "buy-repair"
            ? C.REPAIR_BUY_INCREMENT
            : Infinity,
      );
      const quantity =
        control === "buy-fuel" || control === "buy-repair"
          ? s.credits >= desired * price
            ? desired
            : 0
          : Math.min(desired, s.credits / price);
      if (quantity > 0) {
        s.credits -= quantity * price;
        if (fuel) s.miner.fuel += quantity;
        else s.miner.hull += quantity;
        paid();
      } else note(s, desired ? "Insufficient Credits" : "Already full");
      break;
    }
    case "buy-upgrade": {
      const track = subject as C.TrackName,
        t = s.tiers[track];
      if (t >= C.MAX_TIER[track]) {
        note(s, "Maximum tier installed");
        break;
      }
      if (!afford(C.UPGRADE_PRICES[t - 1])) break;
      const fuel = maxFuel(s),
        hull = maxHull(s);
      s.tiers[track]++;
      s.miner.fuel += maxFuel(s) - fuel;
      s.miner.hull += maxHull(s) - hull;
      paid();
      note(s, `${track.toUpperCase()} · Tier ${t + 1} installed`);
      break;
    }
    case "buy-item": {
      const item = C.ITEMS.find((i) => i.id === subject);
      if (item && afford(item.price)) {
        s.items[item.id]++;
        paid();
      }
      break;
    }
    case "use-item": {
      const id = subject as C.ItemId;
      if (!s.items[id]) {
        note(s, "No supply held");
        break;
      }
      if (
        (id === "nanobots" && s.miner.hull >= maxHull(s)) ||
        (id === "emergency-fuel" && s.miner.fuel >= maxFuel(s))
      ) {
        note(s, "Already full");
        break;
      }
      const at = minerCell(s);
      if (id === "dynamite" || id === "plastic-explosives") {
        const radius =
          id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
        const targets: { col: number; row: number }[] = [];
        for (
          let row = Math.max(1, at.row - radius);
          row <= Math.min(s.coreRow - 1, at.row + radius);
          row++
        )
          for (
            let col = Math.max(1, at.col - radius);
            col <= Math.min(C.WORLD_COLS - 2, at.col + radius);
            col++
          )
            if (
              !["bedrock", "material", "core", "tunnel"].includes(
                tile(s, col, row).kind,
              )
            )
              targets.push({ col, row });
        if (!targets.length) {
          note(s, "Nothing to blast here");
          break;
        }
        for (const p of targets) breakCell(s, p.col, p.row, false);
        effect(s, "gas-explosion");
        cue(s, C.CUES.gasExplosion);
        s.shake = 12;
      }
      if (id === "quantum-teleporter" || id === "matter-transmitter") {
        spawn(s);
        if (id === "quantum-teleporter") {
          const height =
            s.nextTeleportHeight ??
            C.TELEPORT_HEIGHT_TILES_MIN +
              Math.random() *
                (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
          s.miner.y -= height * C.TILE;
          s.miner.vy =
            s.nextTeleportSpeed ??
            C.TELEPORT_SPEED_MIN +
              Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
          s.nextTeleportHeight = null;
          s.nextTeleportSpeed = null;
        }
        effect(s, "core-extract");
        cue(s, C.CUES.materialChime);
      }
      if (id === "nanobots") {
        s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
        effect(s, "material-shimmer");
        paid();
      }
      if (id === "emergency-fuel") {
        s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
        effect(s, "material-shimmer");
        paid();
      }
      s.items[id]--;
      break;
    }
    case "jettison":
      if (s.satchel.coreSample) {
        s.satchel.coreSample = false;
        s.coreGround = minerCell(s);
        note(s, "SAMPLE JETTISONED · Move at least three tiles clear");
      }
      break;
    case "fabricate": {
      const component = C.ROCKET_COMPONENTS[s.installed];
      if (!component) {
        note(s, "Rocket is complete");
        break;
      }
      const material = component.material,
        has =
          !material ||
          (material === "core-sample"
            ? s.satchel.coreSample
            : s.satchel[material] > 0);
      if (!has) {
        note(s, `${material} required`);
        break;
      }
      if (!afford(component.credits)) break;
      if (material === "core-sample") {
        s.satchel.coreSample = false;
        s.coreTimer = null;
      } else if (material) s.satchel[material]--;
      s.installed++;
      paid();
      note(s, `${component.name.toUpperCase()} INSTALLED · ${s.installed}/5`);
      break;
    }
    case "launch":
      if (s.installed === C.ROCKET_COMPONENTS.length && s.launchTime === null) {
        s.launchTime = 0;
        s.panel = null;
        effect(s, "launch-exhaust", 1850, C.SURFACE_Y);
        cue(s, C.CUES.launch);
        eraseSave();
        s.hasSave = false;
      }
      break;
    case "save": {
      if (s.coreTimer !== null) {
        note(s, "Cannot save while a Core Sample is unstable");
        break;
      }
      try {
        const { assets: _assets, ...payload } = s;
        globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        s.hasSave = true;
        note(s, "EXPEDITION SAVED · Surface checkpoint secured");
        paid();
      } catch {
        note(s, "Save unavailable · browser storage is disabled");
      }
      break;
    }
    case "dismiss-notice":
      s.notice = null;
      break;
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      break;
    case "pause":
      if (s.panel) s.panel = null;
      else {
        s.screen = s.screen === "paused" ? "in-mine" : "paused";
        s.menuIndex = 0;
      }
      break;
  }
  checkDeath(s);
}
