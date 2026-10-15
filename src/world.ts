import * as C from "./constants";
import {
  bandAt,
  cell,
  emptyGrid,
  put,
  type DeepcoreState,
  type Rect,
} from "./model";

export const buildings: (Rect & { id: C.BuildingId })[] = C.BUILDINGS.map(
  (id, i) => ({ id, x: 100 + i * 330, y: C.SURFACE_Y - 140, w: 200, h: 140 }),
);

/** Allocate exact band quotas, then protect a connected diggable spine. */
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  for (let row = 1; row < s.coreRow; row++)
    for (let col = 1; col < C.WORLD_COLS - 1; col++)
      put(s, col, row, cell("rock", bandAt(row, s.coreRow)));
  for (const band of C.BANDS) {
    const indices: number[] = [];
    s.grid.forEach((t, i) => {
      if (t.band === band && t.kind === "rock") indices.push(i);
    });
    const shuffled = indices.slice().sort(() => Math.random() - 0.5);
    const count = indices.length;
    const f =
      indices.reduce(
        (a, i) => a + (Math.floor(i / C.WORLD_COLS) - 1) / (s.coreRow - 1),
        0,
      ) / count;
    const available = shuffled.filter(
      (i) =>
        i % C.WORLD_COLS !== C.CAVE_MOUTH_COL &&
        i % C.WORLD_COLS !== C.CORE_COL,
    );
    let cursor = 0;
    const place = (kind: C.TileKind, n: number) => {
      for (let j = 0; j < Math.round(n); j++) {
        const i = available[cursor++];
        if (i !== undefined) s.grid[i] = cell(kind, band);
      }
    };
    if (band !== "topsoil") {
      const t = (f - 0.25) / 0.75;
      place(
        "stone",
        count *
          (C.STONE_DENSITY_MIN +
            (C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * t),
      );
      place(
        "gas",
        count *
          (C.GAS_DENSITY_MIN + (C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * t),
      );
    }
    if (band === "deepstone" || band === "coreshell") {
      const wanted = Math.round(
        count *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5),
      );
      let placed = 0;
      for (const i of available.slice(cursor)) {
        if (placed >= wanted) break;
        for (const offset of [0, 1, C.WORLD_COLS, C.WORLD_COLS + 1]) {
          const j = i + offset,
            t = s.grid[j],
            col = j % C.WORLD_COLS;
          if (
            placed < wanted &&
            t?.kind === "rock" &&
            t.band === band &&
            col > 0 &&
            col < C.WORLD_COLS - 1 &&
            col !== C.CORE_COL &&
            col !== C.CAVE_MOUTH_COL
          ) {
            s.grid[j] = cell("lava", band);
            placed++;
          }
        }
      }
    }
    const rocks = indices
      .filter(
        (i) =>
          s.grid[i].kind === "rock" &&
          Math.floor(i / C.WORLD_COLS) >= C.ORE_MIN_ROW,
      )
      .sort(() => Math.random() - 0.5);
    for (const i of rocks.slice(0, Math.round(count * C.ORE_DENSITY))) {
      const fraction = (Math.floor(i / C.WORLD_COLS) - 1) / (s.coreRow - 1);
      const pool = C.MINERALS.map((m) => ({
        m,
        w: m.pick * Math.max(0, 1 - Math.abs(fraction - m.peak) / m.spread),
      }));
      let roll = Math.random() * pool.reduce((a, p) => a + p.w, 0);
      const selected = pool.find((p) => (roll -= p.w) < 0)?.m ?? C.MINERALS[0];
      s.grid[i] = { ...cell("ore", band), ore: selected.id };
    }
  }
  for (const material of C.MATERIALS) {
    const choices = s.grid
      .map((t, i) =>
        t.band === C.MATERIAL_BAND[material] && t.kind === "rock" ? i : -1,
      )
      .filter((i) => i >= 0);
    const i = choices[Math.floor(Math.random() * choices.length)],
      row = Math.floor(i / C.WORLD_COLS),
      col = i % C.WORLD_COLS;
    s.grid[i] = { ...cell("material", C.MATERIAL_BAND[material]), material };
    // A safe horizontal branch joins each node to the reserved vertical spine.
    for (
      let x = Math.min(col, C.CORE_COL);
      x <= Math.max(col, C.CORE_COL);
      x++
    ) {
      const j = row * C.WORLD_COLS + x;
      if (["stone", "lava"].includes(s.grid[j].kind))
        s.grid[j] = cell("rock", s.grid[j].band);
    }
  }
  for (let x = C.CORE_COL; x <= C.CAVE_MOUTH_COL; x++) {
    const i = (s.coreRow - 1) * C.WORLD_COLS + x;
    if (["stone", "lava"].includes(s.grid[i].kind))
      s.grid[i] = cell("rock", s.grid[i].band);
  }
  put(s, C.CAVE_MOUTH_COL, 1, cell("tunnel", "topsoil"));
}

export function resize(s: DeepcoreState, size: C.WorldSize): void {
  const old = s.coreRow,
    next = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
    grid = emptyGrid(next);
  for (let row = 1; row < Math.min(old, next); row++)
    for (let col = 0; col < C.WORLD_COLS; col++)
      grid[row * C.WORLD_COLS + col] = s.grid[row * C.WORLD_COLS + col];
  s.grid = grid;
  s.worldSize = size;
  s.coreRow = next;
}
