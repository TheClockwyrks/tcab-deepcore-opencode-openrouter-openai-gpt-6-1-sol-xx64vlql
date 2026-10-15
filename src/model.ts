import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
  /** The physically carved upper face of an unfinished downward cut. */
  cutDepth?: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export interface Assets {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface Summary {
  deepestDepthMeters: number;
  creditsEarned: number;
  elapsedSeconds: number;
  mode: C.Mode;
  componentsInstalled: number;
  deathCause: C.DeathCause | null;
}
export interface DeepcoreState {
  assets: Assets;
  grid: Cell[];
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    } | null;
  };
  ore: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  notice: { hazard: C.NoticeHazard; shown: boolean; age: number } | null;
  noticesFired: { gas: boolean; lava: boolean };
  summary: Summary | null;
  hitClock: number;
  hurt: number;
  animTime: number;
  accumulator: number;
  effects: Effect[];
  effectSerial: number;
  shake: number;
  note: string;
  noteTime: number;
  pointerDown: Record<number, string>;
  launchTime: number | null;
  alarmClock: number;
  cues?: C.CueName[];
  panelFocus?: number;
}
export type StateView = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
export const bandAt = (row: number, coreRow: number): C.BandName =>
  C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
export const minable = (kind: C.TileKind) =>
  ["rock", "ore", "material", "gas", "lava"].includes(kind);
export function cell(kind: C.TileKind, band: C.BandName | null): Cell {
  const health = minable(kind) && band ? C.BAND_HEALTH[band] : null;
  return { kind, band, ore: null, material: null, health, maxHealth: health };
}
export function tile(
  s: StateView,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  if (row < 0) return cell("tunnel", null);
  if (col < 0 || col >= C.WORLD_COLS || row > s.coreRow)
    return cell("bedrock", null);
  return s.grid[row * C.WORLD_COLS + col] ?? cell("bedrock", null);
}
export function put(
  s: DeepcoreState,
  col: number,
  row: number,
  value: Cell,
): void {
  s.grid[row * C.WORLD_COLS + col] = value;
}
export function copy(s: StateView): DeepcoreState {
  return {
    ...s,
    assets: s.assets as Assets,
    grid: s.grid.slice() as Cell[],
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    ore: { ...s.ore },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    camera: { ...s.camera },
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    notice: s.notice ? { ...s.notice } : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
    effects: s.effects.map((e) => ({ ...e })),
    pointerDown: { ...s.pointerDown },
    cues: s.cues?.slice(),
  };
}
export function emptyGrid(coreRow: number): Cell[] {
  return Array.from({ length: (coreRow + 1) * C.WORLD_COLS }, (_, i) => {
    const col = i % C.WORLD_COLS,
      row = Math.floor(i / C.WORLD_COLS);
    if (row === 0) return cell("tunnel", null);
    if (row === coreRow)
      return cell(col === C.CORE_COL ? "core" : "bedrock", null);
    return cell(
      col === 0 || col === C.WORLD_COLS - 1 ? "bedrock" : "tunnel",
      bandAt(row, coreRow),
    );
  });
}
export function initial(assets: Assets, muted = false): DeepcoreState {
  return {
    assets,
    grid: emptyGrid(C.STANDARD_ROWS),
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: false,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: -288, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    ore: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as Record<
      C.ItemId,
      number
    >,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    notice: null,
    noticesFired: { gas: false, lava: false },
    summary: null,
    hitClock: 0,
    hurt: 0,
    animTime: 0,
    accumulator: 0,
    effects: [],
    effectSerial: 0,
    shake: 0,
    note: "",
    noteTime: 0,
    pointerDown: {},
    launchTime: null,
    alarmClock: 0,
  };
}
export function cargo(s: StateView) {
  let slotsUsed = 0,
    loadKg = 0,
    value = 0;
  for (const m of C.MINERALS) {
    const n = s.ore[m.id] ?? 0;
    slotsUsed += n;
    loadKg += n * m.weightKg;
    value += n * m.value;
  }
  return {
    slotsUsed,
    slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
    loadKg,
    liftLimitKg: C.JETPACK_TIERS[s.tiers.jetpack - 1].liftLimitKg,
    value,
  };
}
export const maxFuel = (s: StateView) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: StateView) => C.HULL_TIERS[s.tiers.hull - 1];
export const depth = (s: StateView) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: StateView) => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE),
});
export function grounded(s: StateView): boolean {
  const feet = s.miner.y + C.MINER_H;
  const row = Math.floor((feet + 0.001) / C.TILE);
  return [s.miner.x + 1, s.miner.x + C.MINER_W - 1].some((x) => {
    const t = tile(s, Math.floor(x / C.TILE), row);
    return (
      t.kind !== "tunnel" &&
      Math.abs(feet - (row * C.TILE + (t.cutDepth ?? 0))) < 0.02
    );
  });
}
export function scanner(s: StateView) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  const resting = {
    locked: false,
    target: null as C.MaterialId | null,
    dirX: 0,
    dirY: 0,
    distanceTiles: null as number | null,
  };
  if (!range) return resting;
  const at = minerCell(s);
  let best = Infinity,
    target: C.MaterialId | null = null,
    dx = 0,
    dy = 0;
  s.grid.forEach((t, i) => {
    if (t.material && !s.satchel[t.material]) {
      const x = (i % C.WORLD_COLS) - at.col,
        y = Math.floor(i / C.WORLD_COLS) - at.row,
        d = Math.hypot(x, y);
      if (d < best) {
        best = d;
        target = t.material;
        dx = x;
        dy = y;
      }
    }
  });
  return best <= range
    ? {
        locked: true,
        target,
        dirX: dx / (best || 1),
        dirY: dy / (best || 1),
        distanceTiles: best,
      }
    : resting;
}
export function snapshot(s: StateView) {
  const haul = cargo(s),
    at = minerCell(s),
    d = s.miner.drilling;
  const health = d ? tile(s, d.col, d.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...at,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: haul.loadKg >= haul.liftLimitKg,
      drilling: d
        ? {
            ...d,
            progress:
              health?.health !== null && health?.maxHealth
                ? 1 - health.health / health.maxHealth
                : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: haul.slotsUsed,
      slotCap: haul.slotCap,
      loadKg: haul.loadKg,
      liftLimitKg: haul.liftLimitKg,
      ore: Object.fromEntries(
        Object.entries(s.ore).filter(([, n]) => n && n > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.shown }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
