import * as C from "./constants";
import {
  bandAt,
  cell,
  copy,
  initial,
  maxFuel,
  maxHull,
  minable,
  snapshot,
  tile,
  type DeepcoreState,
  type StateView,
} from "./model";
import { controlRect, menuItems, menuRect } from "./layout";
import { eraseSave, readSave, transact } from "./operations";
import { buildings, generate, resize } from "./world";

function valid(
  condition: boolean,
  message = "Invalid debug argument",
): asserts condition {
  if (!condition) throw new RangeError(message);
}
function number(n: number, low = -Infinity, high = Infinity): void {
  valid(Number.isFinite(n) && n >= low && n <= high);
}
function integer(n: number, low = 0, high = Infinity): void {
  number(n, low, high);
  valid(Number.isInteger(n));
}
function member<T>(list: readonly T[], value: T): void {
  valid(list.includes(value));
}
function coordinate(s: StateView, col: number, row: number): void {
  integer(col, 0, C.WORLD_COLS - 1);
  integer(row, 1, s.coreRow);
}
function pose(s: StateView, change: (n: DeepcoreState) => void): DeepcoreState {
  const n = copy(s);
  change(n);
  return n;
}
function operation(
  s: StateView,
  id: string,
  subject: string | null = null,
): DeepcoreState {
  return pose(s, (n) => transact(n, id, subject));
}

export const debugApi = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: StateView, col: number, row: number) => {
    const t =
      row < 0 || row > s.coreRow || col < 0 || col >= C.WORLD_COLS
        ? cell("bedrock", null)
        : tile(s, col, row);
    return {
      kind: t.kind,
      band: t.band,
      ore: t.ore,
      material: t.material,
      health: t.health,
      maxHealth: t.maxHealth,
    };
  },
  findTile(s: StateView, kind: C.TileKind) {
    member(C.TILE_KINDS, kind);
    let nearest: { col: number; row: number } | null = null,
      best = Infinity;
    s.grid.forEach((t, i) => {
      if (t.kind !== kind) return;
      const col = i % C.WORLD_COLS,
        row = Math.floor(i / C.WORLD_COLS),
        d = Math.hypot(
          (col + 0.5) * C.TILE - s.miner.x - C.MINER_W / 2,
          (row + 0.5) * C.TILE - s.miner.y - C.MINER_H / 2,
        );
      if (d < best) {
        best = d;
        nearest = { col, row };
      }
    });
    return nearest;
  },
  buildings: (_s: StateView) => buildings.map((b) => ({ ...b })),
  menuItemRect: menuRect,
  controlRect,
  reset: (s: StateView) => {
    const n = initial(s.assets as DeepcoreState["assets"], s.muted);
    n.hasSave = s.hasSave;
    return n;
  },
  reconcile: (s: StateView) => copy(s),
  generateMine: (s: StateView) => pose(s, generate),
  clearMine: (s: StateView) =>
    pose(s, (n) => {
      n.grid = n.grid.map((t, i) => {
        const row = Math.floor(i / C.WORLD_COLS),
          col = i % C.WORLD_COLS;
        return row > 0 && row < n.coreRow && col > 0 && col < C.WORLD_COLS - 1
          ? cell("tunnel", t.band)
          : t;
      });
    }),
  clearCargo: (s: StateView) =>
    pose(s, (n) => {
      n.ore = {};
    }),
  clearItems: (s: StateView) =>
    pose(s, (n) => {
      for (const id of C.ITEM_IDS) n.items[id] = 0;
    }),
  setTile(
    s: StateView,
    col: number,
    row: number,
    kind: Exclude<C.TileKind, "ore" | "material">,
  ) {
    coordinate(s, col, row);
    member(C.TILE_KINDS, kind);
    valid(kind !== ("ore" as string) && kind !== ("material" as string));
    return pose(s, (n) => {
      n.grid[row * C.WORLD_COLS + col] = cell(
        kind,
        row < n.coreRow ? bandAt(row, n.coreRow) : null,
      );
    });
  },
  setOreTile(s: StateView, col: number, row: number, ore: C.OreId) {
    coordinate(s, col, row);
    valid(C.MINERALS.some((m) => m.id === ore));
    return pose(s, (n) => {
      n.grid[row * C.WORLD_COLS + col] = {
        ...cell("ore", bandAt(row, n.coreRow)),
        ore,
      };
    });
  },
  setMaterialTile(
    s: StateView,
    col: number,
    row: number,
    material: C.MaterialId,
  ) {
    coordinate(s, col, row);
    member(C.MATERIALS, material);
    return pose(s, (n) => {
      n.grid[row * C.WORLD_COLS + col] = {
        ...cell("material", bandAt(row, n.coreRow)),
        material,
      };
    });
  },
  setTileHealth(s: StateView, col: number, row: number, health: number) {
    coordinate(s, col, row);
    const t = tile(s, col, row);
    valid(minable(t.kind));
    number(health, Number.MIN_VALUE, t.maxHealth ?? 0);
    return pose(s, (n) => {
      n.grid[row * C.WORLD_COLS + col] = { ...t, health };
    });
  },
  placeCoreSample(s: StateView, col: number, row: number) {
    coordinate(s, col, row);
    valid(s.coreTimer === null && tile(s, col, row).kind === "tunnel");
    return pose(s, (n) => {
      n.coreGround = { col, row };
      n.coreTimer = C.CORE_TIMER;
    });
  },
  setMinerPosition(s: StateView, x: number, y: number) {
    number(x);
    number(y);
    return pose(s, (n) => {
      n.miner.x = x;
      n.miner.y = y;
    });
  },
  setMinerVelocity(s: StateView, vx: number, vy: number) {
    number(vx);
    number(vy);
    return pose(s, (n) => {
      n.miner.vx = vx;
      n.miner.vy = vy;
    });
  },
  setFacing(s: StateView, facing: C.Facing) {
    member(C.FACINGS, facing);
    return pose(s, (n) => {
      n.miner.facing = facing;
    });
  },
  setFuel(s: StateView, value: number) {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.fuel = value;
    });
  },
  setHull(s: StateView, value: number) {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.hull = value;
    });
  },
  setMinerTravel(s: StateView, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.travel = enabled;
    });
  },
  setMinerDrill(s: StateView, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.drill = enabled;
    });
  },
  setScreen(s: StateView, screen: C.ScreenName) {
    member(C.SCREENS, screen);
    return pose(s, (n) => {
      n.screen = screen;
    });
  },
  setPanel(s: StateView, panel: C.PanelId | null) {
    if (panel !== null) member(C.PANELS, panel);
    return pose(s, (n) => {
      n.panel = panel;
    });
  },
  setMenuIndex(s: StateView, index: number) {
    integer(index, 0, menuItems(s).length - 1);
    return pose(s, (n) => {
      n.menuIndex = index;
    });
  },
  setMode(s: StateView, mode: C.Mode) {
    member(C.MODES, mode);
    return pose(s, (n) => {
      n.mode = mode;
    });
  },
  setWorldSize(s: StateView, size: C.WorldSize) {
    member(C.WORLD_SIZES, size);
    return pose(s, (n) => resize(n, size));
  },
  setCredits(s: StateView, value: number) {
    number(value, 0);
    return pose(s, (n) => {
      n.credits = value;
    });
  },
  setTier(s: StateView, track: C.TrackName, tier: number) {
    member(C.TRACKS, track);
    integer(tier, 1, C.MAX_TIER[track]);
    return pose(s, (n) => {
      n.tiers[track] = tier;
      n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
      n.miner.hull = Math.min(n.miner.hull, maxHull(n));
    });
  },
  setCargo(s: StateView, ore: C.OreId, count: number) {
    valid(C.MINERALS.some((m) => m.id === ore));
    integer(count);
    return pose(s, (n) => {
      if (count) n.ore[ore] = count;
      else delete n.ore[ore];
    });
  },
  setMaterial(s: StateView, material: C.MaterialId, count: number) {
    member(C.MATERIALS, material);
    integer(count);
    return pose(s, (n) => {
      n.satchel[material] = count;
    });
  },
  setCoreCarried(s: StateView, carried: boolean) {
    valid(typeof carried === "boolean");
    if (carried) valid(s.coreTimer === null);
    return pose(s, (n) => {
      n.satchel.coreSample = carried;
      if (carried) n.coreTimer = C.CORE_TIMER;
      else if (s.satchel.coreSample) n.coreTimer = null;
    });
  },
  setCoreTimer(s: StateView, seconds: number) {
    number(seconds, Number.MIN_VALUE);
    valid(s.coreTimer !== null);
    return pose(s, (n) => {
      n.coreTimer = seconds;
    });
  },
  setItemCount(s: StateView, item: C.ItemId, count: number) {
    member(C.ITEM_IDS, item);
    integer(count);
    return pose(s, (n) => {
      n.items[item] = count;
    });
  },
  setRocketInstalled(s: StateView, count: number) {
    integer(count, 0, C.ROCKET_COMPONENTS.length);
    return pose(s, (n) => {
      n.installed = count;
    });
  },
  setNoticeFired(s: StateView, hazard: C.NoticeHazard, fired: boolean) {
    member(C.NOTICE_HAZARDS, hazard);
    valid(typeof fired === "boolean");
    return pose(s, (n) => {
      n.noticesFired[hazard] = fired;
    });
  },
  setCameraLead(s: StateView, lead: number) {
    number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
    return pose(s, (n) => {
      n.camera.lead = lead;
    });
  },
  setElapsed(s: StateView, seconds: number) {
    number(seconds, 0);
    return pose(s, (n) => {
      n.elapsedSeconds = seconds;
    });
  },
  clearSave: (s: StateView) =>
    pose(s, (n) => {
      eraseSave();
      n.hasSave = false;
    }),
  setNextTeleportHeight(s: StateView, tiles: number | null) {
    if (tiles !== null)
      number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
    return pose(s, (n) => {
      n.nextTeleportHeight = tiles;
    });
  },
  setNextTeleportSpeed(s: StateView, speed: number | null) {
    if (speed !== null)
      number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
    return pose(s, (n) => {
      n.nextTeleportSpeed = speed;
    });
  },
  dropOre(s: StateView, ore: C.OreId) {
    valid(C.MINERALS.some((m) => m.id === ore));
    return operation(s, "drop-ore", ore);
  },
  sell: (s: StateView) => operation(s, "sell"),
  buyFuel: (s: StateView) => operation(s, "buy-fuel"),
  fillFuel: (s: StateView) => operation(s, "fill-fuel"),
  buyRepair: (s: StateView) => operation(s, "buy-repair"),
  repairFull: (s: StateView) => operation(s, "repair-full"),
  buyUpgrade(s: StateView, track: C.TrackName) {
    member(C.TRACKS, track);
    return operation(s, "buy-upgrade", track);
  },
  buyItem(s: StateView, item: C.ItemId) {
    member(C.ITEM_IDS, item);
    return operation(s, "buy-item", item);
  },
  useItem(s: StateView, item: C.ItemId) {
    member(C.ITEM_IDS, item);
    return operation(s, "use-item", item);
  },
  jettison: (s: StateView) => operation(s, "jettison"),
  fabricate: (s: StateView) => operation(s, "fabricate"),
  launch: (s: StateView) => operation(s, "launch"),
  save: (s: StateView) => operation(s, "save"),
  dismissNotice: (s: StateView) => operation(s, "dismiss-notice"),
};
export type DeepcoreDebugApi = typeof debugApi;
export const hasSave = () => readSave() !== null;
