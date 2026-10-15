import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  cargo,
  depth,
  maxFuel,
  maxHull,
  scanner,
  tile,
  type Rect,
  type StateView,
} from "./model";
import { controls, menuItems, menuRect, noticeRect } from "./layout";
import { buildings } from "./world";

type Context = CanvasRenderingContext2D;
const P = {
  bg: "#0b1720",
  panel: "#10232d",
  line: "#304751",
  ink: "#e6e9d9",
  muted: "#8fa8ad",
  amber: "#edbd73",
  teal: "#83d7c6",
  red: "#f48470",
};
const cycleCounts: Record<C.MinerState, number> = {
  idle: 4,
  walk: 6,
  "drill-down": 4,
  "drill-side": 4,
  jetpack: 4,
  fall: 4,
  hurt: 3,
  "fuel-out": 4,
};
const names: Record<C.BuildingId, string> = {
  "fuel-depot": "FUEL & REPAIR",
  "ore-market": "ORE EXCHANGE",
  "save-pad": "SAVE PAD",
  "upgrade-shop": "ENGINEERING",
  "supply-depot": "FIELD SUPPLIES",
  "launch-pad": "LAUNCH SITE",
};
const bandColors: Record<C.BandName, string> = {
  topsoil: "#b3a186",
  rockbed: "#8facb6",
  deepstone: "#7a9cc0",
  coreshell: "#dd8e77",
};

function text(
  ctx: Context,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = P.ink,
  weight = "400",
  font = "monospace",
): void {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = P.line,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function box(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = P.panel,
  stroke = P.line,
  radius = 0,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function image(
  s: StateView,
  ctx: Context,
  path: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = s.assets.images[path];
  if (img) ctx.drawImage(img as ImageBitmap, x, y, w, h);
}
function icon(
  s: StateView,
  ctx: Context,
  name: string,
  x: number,
  y: number,
  size = C.ICON_SIZE,
): void {
  image(s, ctx, `icons/${name}.png`, x, y, size, size);
}
function paragraphs(
  ctx: Context,
  lines: readonly string[],
  x: number,
  y: number,
  size = 17,
  color = P.muted,
  gap = 28,
): void {
  lines.forEach((str, i) =>
    text(ctx, str, x, y + i * gap, size, color, "400", "sans-serif"),
  );
}
function button(
  ctx: Context,
  r: Rect,
  label: string,
  active = false,
  enabled = true,
): void {
  box(
    ctx,
    r.x,
    r.y,
    r.w,
    r.h,
    active ? P.amber : enabled ? "#18313c" : "#13252e",
    active ? P.amber : enabled ? "#42606a" : "#263c45",
    3,
  );
  text(
    ctx,
    label,
    r.x + 16,
    r.y + r.h / 2 + 6,
    14,
    active ? P.bg : enabled ? P.ink : "#59717b",
    "600",
  );
  if (active) text(ctx, "↗", r.x + r.w - 30, r.y + r.h / 2 + 7, 20, P.bg);
}

function drawTile(s: StateView, ctx: Context, col: number, row: number): void {
  const t = tile(s, col, row),
    x = col * C.TILE,
    y = row * C.TILE,
    variant = Math.abs(col * 17 + row * 31) % C.TILE_VARIANTS;
  const band = t.band ?? "coreshell";
  if (t.kind === "bedrock" || t.kind === "core")
    image(s, ctx, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
  else image(s, ctx, `tiles/${band}-${variant}.png`, x, y, C.TILE, C.TILE);
  if (t.kind === "tunnel" || t.kind === "lava") {
    const same = (c: number, r: number) =>
      tile(s, c, r).kind === t.kind ||
      (t.kind === "tunnel" &&
        (r <= 0 ||
          (c === col && r === row + 1 && (tile(s, c, r).cutDepth ?? 0) > 0)));
    const up = same(col, row - 1),
      down = same(col, row + 1),
      left = same(col - 1, row),
      right = same(col + 1, row);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 8, y + 8, 64, 64, 18);
    if (up) ctx.rect(x + 8, y, 64, 40);
    if (down) ctx.rect(x + 8, y + 40, 64, 40);
    if (left) ctx.rect(x, y + 8, 40, 64);
    if (right) ctx.rect(x + 40, y + 8, 40, 64);
    if (up && left && same(col - 1, row - 1)) ctx.rect(x, y, 40, 40);
    if (up && right && same(col + 1, row - 1)) ctx.rect(x + 40, y, 40, 40);
    if (down && left && same(col - 1, row + 1)) ctx.rect(x, y + 40, 40, 40);
    if (down && right && same(col + 1, row + 1))
      ctx.rect(x + 40, y + 40, 40, 40);
    ctx.clip();
    const path =
      t.kind === "lava"
        ? `hazards/lava/frame${String(Math.floor(s.elapsedSeconds * 5) % 4).padStart(2, "0")}.png`
        : "tiles/tunnel.png";
    image(s, ctx, path, x, y, C.TILE, C.TILE);
    ctx.restore();
    // Convex lips where a diagonal solid tile projects into an L or T junction.
    if (t.kind === "tunnel") {
      for (const [dx, dy, a, b] of [
        [-1, -1, 0, Math.PI / 2],
        [1, -1, Math.PI / 2, Math.PI],
        [-1, 1, -Math.PI / 2, 0],
        [1, 1, Math.PI, Math.PI * 1.5],
      ]) {
        if (
          same(col + dx, row) &&
          same(col, row + dy) &&
          !same(col + dx, row + dy)
        ) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x + (dx < 0 ? 0 : 80), y + (dy < 0 ? 0 : 80));
          ctx.arc(x + (dx < 0 ? 0 : 80), y + (dy < 0 ? 0 : 80), 13, a, b);
          ctx.closePath();
          ctx.clip();
          image(s, ctx, `tiles/${band}-${variant}.png`, x, y, 80, 80);
          ctx.restore();
        }
      }
    }
  }
  if (t.ore) image(s, ctx, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
  if (t.material)
    image(s, ctx, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
  if (t.kind === "stone")
    image(s, ctx, `tiles/stone-${(col + row) % 2}.png`, x, y, C.TILE, C.TILE);
  if (t.kind === "core")
    image(s, ctx, "materials/core.png", x, y, C.TILE, C.TILE);
  if (t.health !== null && t.maxHealth && t.health < t.maxHealth) {
    const frame = Math.min(
      C.CRACK_FRAMES - 1,
      Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES),
    );
    image(
      s,
      ctx,
      `tiles/crack/frame${String(frame).padStart(2, "0")}.png`,
      x,
      y,
      C.TILE,
      C.TILE,
    );
  }
  if (t.cutDepth) {
    const cut = t.cutDepth;
    if (cut > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 8, y - 18, 64, cut + 18, 16);
      ctx.clip();
      image(s, ctx, "tiles/tunnel.png", x, y, C.TILE, C.TILE);
      ctx.restore();
    }
  }
  if (t.kind !== "tunnel") {
    ctx.strokeStyle = "#0b172018";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
  }
}

function miner(
  s: StateView,
  ctx: Context,
  x = s.miner.x - 12,
  y = s.miner.y,
  size = C.MINER_SPRITE,
  state = s.miner.state,
): void {
  const count = cycleCounts[state],
    frame =
      state === "hurt"
        ? Math.min(count - 1, Math.floor(s.animTime * C.ANIM_FPS))
        : Math.floor(
            (s.screen === "title" ? s.simTime : s.animTime) * C.ANIM_FPS,
          ) % count;
  ctx.save();
  if (s.miner.facing === "west") {
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    x = 0;
    y = 0;
  }
  image(
    s,
    ctx,
    `miner/${state}/frame${String(frame).padStart(2, "0")}.png`,
    x,
    y,
    size,
    size,
  );
  ctx.restore();
}

/** Replay an effect from its state-carried age. Rendering is referentially pure. */
function particles(s: StateView, ctx: Context): void {
  // The binding fits to ctx.canvas; provide a logical effect field while keeping every
  // actual draw on the engine's context (and therefore in its recording).
  let painting = false;
  const logicalContext = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 512, height: 512 };
      if (key === "fill" && !painting) return () => undefined;
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  for (const fx of s.effects) {
    const authored = s.assets.systems[fx.name];
    if (!authored) continue;
    const system = fx.tint
      ? {
          ...authored,
          emitters: authored.emitters.map((em) => ({
            ...em,
            particle: {
              ...em.particle,
              colorGradient: em.particle?.colorGradient?.map((stop, i) => ({
                ...stop,
                color: i === 0 ? fx.tint! : stop.color,
              })),
            },
          })),
        }
      : authored;
    if (
      fx.x < s.camera.x - 500 ||
      fx.x > s.camera.x + C.VIEW_W + 500 ||
      fx.y < s.camera.y - 500 ||
      fx.y > s.camera.y + C.VIEW_H + 500
    )
      continue;
    ctx.save();
    ctx.translate(fx.x, fx.y - 512);
    painting = false;
    const player = new ParticleCanvasPlayer(
      system as ParticleSystem,
      logicalContext,
      {
        clear: false,
        seed: fx.seed,
        pixelRadius: 8,
        composite:
          fx.name === "impact-dust" || fx.name === "gas-seep"
            ? "source-over"
            : "lighter",
      },
    );
    painting = true;
    player.update(fx.age);
    ctx.restore();
  }
}

function world(s: StateView, ctx: Context): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const skyY = C.HUD_H - C.SURFACE_Y - s.camera.y - 520;
  ctx.fillStyle = "#0d1d28";
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  image(s, ctx, "surface/sky.png", -s.camera.x * 0.12, skyY, 1536, 720);
  const shake = s.shake;
  ctx.translate(
    -s.camera.x + Math.sin(s.elapsedSeconds * 83) * shake,
    C.HUD_H - s.camera.y + Math.cos(s.elapsedSeconds * 97) * shake * 0.7,
  );
  const minCol = Math.max(0, Math.floor(s.camera.x / C.TILE) - 1),
    maxCol = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE) + 1,
    );
  const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE) - 1),
    maxRow = Math.min(
      s.coreRow,
      Math.ceil((s.camera.y + C.VIEW_H) / C.TILE) + 1,
    );
  for (let row = minRow; row <= maxRow; row++)
    for (let col = minCol; col <= maxCol; col++) drawTile(s, ctx, col, row);
  if (s.camera.y < C.SURFACE_Y + 180) {
    for (let x = 0; x < C.WORLD_W; x += 160)
      if (x + 160 > s.camera.x && x < s.camera.x + C.VIEW_W) {
        image(s, ctx, "surface/ground.png", x, C.SURFACE_Y - 4, 160, 25);
      }
    image(
      s,
      ctx,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE - 40,
      C.SURFACE_Y - 84,
      160,
      100,
    );
    for (const b of buildings) {
      image(s, ctx, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      if (b.id === "launch-pad")
        image(
          s,
          ctx,
          `rocket/stage${s.installed}.png`,
          b.x + 20,
          b.y - 70 - (s.launchTime ?? 0) ** 2 * 100,
          160,
          210,
        );
      const nearby =
        Math.abs(s.miner.x + C.MINER_W / 2 - b.x - b.w / 2) < b.w / 2 + 65 &&
        Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) <= 2;
      text(
        ctx,
        names[b.id],
        b.x,
        b.y - 20,
        12,
        nearby ? P.amber : P.muted,
        "600",
      );
      if (nearby && !s.panel && s.launchTime === null) {
        box(ctx, b.x + 42, b.y - 63, 120, 27, "#122b35", P.amber, 3);
        text(ctx, "[E] INTERACT", b.x + 51, b.y - 44, 12, P.amber);
      }
    }
    text(
      ctx,
      "↓ MINE ACCESS",
      C.CAVE_MOUTH_COL * C.TILE - 25,
      C.SURFACE_Y - 110,
      13,
      P.amber,
    );
  }
  if (s.coreGround) {
    const g = s.coreGround;
    image(
      s,
      ctx,
      "materials/core-sample.png",
      g.col * C.TILE,
      g.row * C.TILE,
      80,
      80,
    );
    text(
      ctx,
      `${s.coreTimer?.toFixed(1)} s`,
      g.col * C.TILE,
      g.row * C.TILE - 10,
      20,
      P.red,
      "700",
    );
  }
  if (s.launchTime === null) miner(s, ctx);
  particles(s, ctx);
  ctx.restore();
  // A soft optical vignette gives the lamp's vicinity visual focus.
  const light = ctx.createRadialGradient(
    C.VIEW_W / 2,
    C.HUD_H + C.VIEW_H / 2,
    200,
    C.VIEW_W / 2,
    C.HUD_H + C.VIEW_H / 2,
    760,
  );
  light.addColorStop(0, "#06131b00");
  light.addColorStop(1, "#06131b8c");
  ctx.fillStyle = light;
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
}

function gauge(
  s: StateView,
  ctx: Context,
  name: string,
  x: number,
  value: number,
  max: number,
  color: string,
  low: boolean,
): void {
  icon(s, ctx, name, x, 15);
  text(ctx, name.toUpperCase(), x + 32, 20, 10, P.muted, "600");
  text(
    ctx,
    `${Math.ceil(value)} / ${max}`,
    x + 32,
    37,
    14,
    low ? P.red : color,
    "600",
  );
  box(ctx, x + 32, 43, 124, 3, "#243942", "");
  ctx.fillStyle = low ? P.red : color;
  ctx.fillRect(x + 32, 43, 124 * Math.min(1, Math.max(0, value / max)), 3);
}
function hud(s: StateView, ctx: Context): void {
  box(ctx, 0, 0, C.STAGE_W, C.HUD_H, "#0d202a", "");
  line(ctx, 0, 55, C.STAGE_W, 55, "#4e635e");
  gauge(
    s,
    ctx,
    "fuel",
    22,
    s.miner.fuel,
    maxFuel(s),
    P.amber,
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION,
  );
  gauge(
    s,
    ctx,
    "hull",
    205,
    s.miner.hull,
    maxHull(s),
    P.teal,
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION,
  );
  const haul = cargo(s),
    over = haul.loadKg >= haul.liftLimitKg;
  icon(s, ctx, "cargo", 392, 15);
  text(ctx, "CARGO", 424, 20, 10, P.muted, "600");
  text(
    ctx,
    `${haul.slotsUsed}/${haul.slotCap} · ${over ? C.OVERLOAD : `${haul.loadKg} kg`}`,
    424,
    39,
    14,
    over || haul.slotsUsed >= haul.slotCap ? P.red : P.ink,
    "600",
  );
  line(ctx, 594, 12, 594, 44);
  icon(s, ctx, "credits", 612, 15);
  text(ctx, "CREDITS", 644, 20, 10, P.muted, "600");
  text(
    ctx,
    Math.floor(s.credits).toLocaleString(),
    644,
    39,
    16,
    P.amber,
    "600",
  );
  icon(s, ctx, "depth", 766, 15);
  text(ctx, "DEPTH", 798, 20, 10, P.muted, "600");
  text(
    ctx,
    `${Math.floor(depth(s)).toLocaleString()} m`,
    798,
    39,
    16,
    P.ink,
    "600",
  );
  for (const [i, name] of C.MATERIALS.entries()) {
    ctx.save();
    ctx.globalAlpha = s.satchel[name] ? 1 : 0.25;
    icon(s, ctx, name, 906 + i * 37, 16);
    ctx.restore();
  }
  for (const c of controls(s).filter((c) => c.y < 56))
    button(ctx, c, c.label, false, c.enabled);
}

function worldLabels(s: StateView, ctx: Context): void {
  const d = depth(s),
    band =
      C.BANDS[
        Math.min(3, Math.floor((d / (s.coreRow * C.METERS_PER_ROW)) * 4))
      ];
  if (d < 1) {
    box(ctx, 24, 80, 284, 78, "#0b1e29d9", "#3f555b", 4);
    text(ctx, "OUTPOST  /  SURFACE", 40, 104, 11, P.amber, "600");
    text(
      ctx,
      "Build your way off this rock.",
      40,
      128,
      17,
      P.ink,
      "600",
      "sans-serif",
    );
    text(
      ctx,
      `${s.installed}/5 rocket systems installed`,
      40,
      146,
      12,
      P.muted,
    );
  } else {
    text(
      ctx,
      "STRATUM 0" + (C.BANDS.indexOf(band) + 1),
      27,
      90,
      10,
      bandColors[band],
      "600",
    );
    text(ctx, band.toUpperCase(), 27, 116, 21, P.ink, "600", "sans-serif");
    text(
      ctx,
      `↓ ${Math.round(s.coreRow * C.METERS_PER_ROW - d).toLocaleString()} m TO CORE`,
      27,
      139,
      11,
      P.muted,
    );
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === C.BANDS.indexOf(band) ? P.amber : "#40545c";
      ctx.fillRect(1236, 105 + i * 90, 3, 82);
    }
    const fy = 105 + Math.min(1, d / (s.coreRow * C.METERS_PER_ROW)) * 352;
    ctx.fillStyle = P.amber;
    ctx.fillRect(1229, fy, 17, 3);
    for (
      let row = Math.ceil(s.camera.y / C.TILE / 5) * 5;
      row * C.TILE < s.camera.y + C.VIEW_H;
      row += 5
    ) {
      if (row < 1) continue;
      const y = row * C.TILE - s.camera.y + C.HUD_H;
      line(ctx, 1194, y, 1215, y, "#8aa7aa66");
      text(ctx, `${(row - 1) * C.METERS_PER_ROW}`, 1144, y + 4, 10, "#8aa7aa");
    }
  }
  const scan = scanner(s);
  if (scan.locked) {
    box(ctx, 460, 80, 360, 46, "#102d36ed", "#69b4a9", 4);
    text(
      ctx,
      `${scan.dirX < -0.25 ? "←" : scan.dirX > 0.25 ? "→" : ""}${scan.dirY < -0.25 ? "↑" : "↓"} ${scan.target?.toUpperCase()} · ${scan.distanceTiles?.toFixed(1)} TILES`,
      480,
      108,
      15,
      P.teal,
      "600",
    );
  }
  if (s.satchel.coreSample && s.coreTimer !== null) {
    box(ctx, 462, 136, 356, 72, "#351f26f2", P.red, 4);
    text(ctx, "UNSTABLE CORE SAMPLE", 481, 159, 11, P.red, "600");
    text(
      ctx,
      `${s.coreTimer.toFixed(1)} s`,
      481,
      189,
      30,
      P.ink,
      "700",
      "sans-serif",
    );
    text(ctx, "[J] JETTISON", 651, 186, 12, P.amber);
  }
  if (s.noteTime > 0) {
    ctx.globalAlpha = Math.min(1, s.noteTime);
    const w = Math.min(800, s.note.length * 8 + 40);
    const y =
      s.miner.y - s.camera.y + C.HUD_H > 550
        ? s.satchel.coreSample
          ? 218
          : 164
        : 623;
    box(ctx, (1280 - w) / 2, y, w, 37, "#0b202be8", "#4b6769", 4);
    text(ctx, s.note, (1280 - w) / 2 + 20, y + 24, 13, P.amber);
    ctx.globalAlpha = 1;
  }
  if (s.notice?.shown) {
    const r = noticeRect(s);
    box(ctx, r.x, r.y, r.w, r.h, "#122b34f5", P.amber, 5);
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "VOLATILE GAS  /  WATCH FOR THE SEEP"
        : "MOLTEN ROCK  /  GIVE IT SPACE",
      370,
      r.y + 24,
      13,
      P.amber,
      "700",
    );
    paragraphs(
      ctx,
      s.notice.hazard === "gas"
        ? [
            "Pale wisps betray a pocket. Gas ignores your radiator.",
            "Upgrade your hull before venturing deeper.  [click to dismiss]",
          ]
        : [
            "Lava burns on contact and when drilled. Plan a route around it.",
            "A radiator reduces the heat.  [click to dismiss]",
          ],
      370,
      r.y + 49,
      14,
      P.ink,
      22,
    );
  }
  if (s.miner.y + C.MINER_H >= (s.coreRow - 2) * C.TILE) return;
  box(ctx, 0, 678, 1280, 42, "#0b1c25e8", "");
  line(ctx, 24, 678, 1256, 678, "#304750");
  text(ctx, "A D  MOVE / CUT", 26, 703, 11, P.muted);
  text(ctx, "S  DRILL DOWN", 231, 703, 11, P.muted);
  text(ctx, "W / SPACE  JETPACK", 433, 703, 11, P.amber);
  text(ctx, "E  INTERACT", 709, 703, 11, P.muted);
  text(ctx, "I  CARGO", 903, 703, 11, P.muted);
  text(ctx, "1—6  SUPPLIES", 1080, 703, 11, P.muted);
}

function upgradeEffect(track: C.TrackName, tier: number): string {
  const i = tier - 1;
  switch (track) {
    case "fuel":
      return `${C.FUEL_TIERS[i]} fuel capacity`;
    case "drill":
      return `Power rating ${tier}`;
    case "cargo":
      return `${C.CARGO_TIERS[i]} mineral slots`;
    case "hull":
      return `${C.HULL_TIERS[i]} hull integrity`;
    case "jetpack":
      return `${C.JETPACK_TIERS[i].liftLimitKg.toLocaleString()} kg lift limit`;
    case "radiator":
      return `${C.RADIATOR_TIERS[i] * 100}% heat resistance`;
    case "scanner":
      return C.SCANNER_TIERS[i]
        ? `${C.SCANNER_TIERS[i]} tile detection range`
        : "No scanner installed";
  }
}
function panel(s: StateView, ctx: Context): void {
  if (!s.panel) return;
  ctx.fillStyle = "#051018b8";
  ctx.fillRect(0, C.HUD_H, 1280, 664);
  box(ctx, 248, 98, 752, 550, "#10232df7", "#63716b", 6);
  ctx.fillStyle = P.amber;
  ctx.fillRect(248, 98, 4, 56);
  text(
    ctx,
    s.panel === "inventory" ? "CARGO MANIFEST" : names[s.panel],
    280,
    137,
    22,
    P.ink,
    "700",
    "sans-serif",
  );
  text(
    ctx,
    `AVAILABLE  ${Math.floor(s.credits).toLocaleString()} CR`,
    280,
    167,
    11,
    P.amber,
  );
  line(ctx, 280, 178, 966, 178);
  if (s.panel === "fuel-depot") {
    for (const c of controls(s).filter((c) => c.y >= 200 && c.y < 450)) {
      text(ctx, c.detail, c.x, c.y + 62, 13, P.muted);
    }
    paragraphs(
      ctx,
      [
        "The surface gives nothing back for free.",
        "Buy only what you need. Leave enough Credits for the next run.",
      ],
      288,
      460,
      17,
      P.muted,
      31,
    );
    text(
      ctx,
      `TANK  ${s.miner.fuel.toFixed(1)} / ${maxFuel(s)}    HULL  ${s.miner.hull.toFixed(1)} / ${maxHull(s)}`,
      288,
      555,
      16,
      P.teal,
    );
  }
  if (s.panel === "ore-market") {
    const minerals = C.MINERALS.filter((m) => (s.ore[m.id] ?? 0) > 0);
    if (!minerals.length)
      paragraphs(
        ctx,
        [
          "Nothing in the hold. Yet.",
          "Mineral seams begin beneath the first three rows of rock.",
        ],
        288,
        230,
        19,
      );
    minerals.forEach((m, i) => {
      const y = 207 + i * 24;
      image(s, ctx, `ore/${m.id}.png`, 284, y - 15, 24, 24);
      text(ctx, m.name, 324, y + 3, 14, P.ink);
      text(ctx, `× ${s.ore[m.id]}`, 550, y + 3, 14, P.muted);
      text(ctx, `${(s.ore[m.id] ?? 0) * m.value} CR`, 750, y + 3, 14, P.amber);
    });
    line(ctx, 284, 538, 958, 538);
    text(ctx, "TOTAL HAUL VALUE", 288, 565, 11, P.muted);
    text(
      ctx,
      `${cargo(s).value.toLocaleString()} CR`,
      288,
      595,
      27,
      P.amber,
      "700",
      "sans-serif",
    );
  }
  if (s.panel === "upgrade-shop")
    C.TRACKS.forEach((track, i) => {
      const tier = s.tiers[track],
        y = 207 + i * 52;
      text(ctx, track.toUpperCase(), 284, y, 15, P.ink, "600");
      text(ctx, `T${tier}`, 449, y, 13, P.amber);
      text(ctx, upgradeEffect(track, tier), 492, y, 13, P.muted);
      if (tier < C.MAX_TIER[track])
        text(
          ctx,
          `NEXT → ${upgradeEffect(track, tier + 1)}`,
          492,
          y + 19,
          11,
          P.teal,
        );
      for (let n = 0; n < C.MAX_TIER[track]; n++) {
        ctx.fillStyle = n < tier ? P.amber : "#324a55";
        ctx.fillRect(285 + n * 25, y + 11, 19, 3);
      }
    });
  if (s.panel === "supply-depot")
    C.ITEMS.forEach((item, i) => {
      const y = 220 + i * 57;
      box(ctx, 282, y - 21, 32, 32, "#243d46", "#59727a", 4);
      text(ctx, String(i + 1), 293, y + 1, 17, P.amber, "700");
      text(ctx, item.name, 331, y - 2, 17, P.ink, "500", "sans-serif");
      text(
        ctx,
        `HELD ${s.items[item.id]}  ·  HOTKEY ${i + 1}`,
        331,
        y + 17,
        11,
        P.muted,
      );
    });
  if (s.panel === "launch-pad") {
    image(s, ctx, `rocket/stage${s.installed}.png`, 280, 260, 184, 242);
    C.ROCKET_COMPONENTS.forEach((c, i) => {
      const y = 220 + i * 59,
        done = i < s.installed,
        next = i === s.installed;
      text(
        ctx,
        done ? "✓" : `0${i + 1}`,
        492,
        y,
        18,
        done ? P.teal : next ? P.amber : P.muted,
        "600",
      );
      text(ctx, c.name, 535, y, 18, done ? P.teal : P.ink, "600", "sans-serif");
      text(
        ctx,
        done
          ? "INSTALLED"
          : `${c.credits.toLocaleString()} CR${c.material ? ` + ${c.material.toUpperCase()}` : ""}`,
        535,
        y + 22,
        12,
        next ? P.amber : P.muted,
      );
    });
    text(ctx, `${s.installed}/5 SYSTEMS ONLINE`, 284, 562, 13, P.amber);
    text(
      ctx,
      s.installed === 5
        ? "HOME IS ONE IGNITION AWAY."
        : "FABRICATE IN CHECKLIST ORDER.",
      284,
      595,
      11,
      P.muted,
    );
  }
  if (s.panel === "inventory") {
    const haul = cargo(s),
      over = haul.loadKg >= haul.liftLimitKg;
    text(
      ctx,
      `${haul.slotsUsed}/${haul.slotCap} SLOTS · ${haul.loadKg}/${haul.liftLimitKg} kg`,
      284,
      189,
      11,
      over ? P.red : P.muted,
    );
    C.MINERALS.filter((m) => (s.ore[m.id] ?? 0) > 0).forEach((m, i) => {
      const y = 212 + i * 27;
      image(s, ctx, `ore/${m.id}.png`, 280, y - 22, 26, 26);
      text(ctx, m.name, 315, y, 13, P.ink);
      text(
        ctx,
        `×${s.ore[m.id]}  ${(s.ore[m.id] ?? 0) * m.weightKg}kg`,
        419,
        y,
        12,
        P.muted,
      );
    });
    line(ctx, 647, 194, 647, 600);
    text(ctx, "MATERIAL SATCHEL", 674, 207, 11, P.teal, "600");
    C.MATERIALS.forEach((m, i) => {
      icon(s, ctx, m, 674 + i * 142, 221);
      text(
        ctx,
        `${m.toUpperCase()} ${s.satchel[m]}`,
        704 + i * 142,
        238,
        10,
        P.ink,
      );
    });
    text(ctx, "FIELD SUPPLIES", 674, 263, 11, P.amber, "600");
    C.ITEMS.forEach((item, i) => {
      const y = 294 + i * 44;
      text(
        ctx,
        `${i + 1}  ${item.name.replace("Regenerative ", "")}`,
        674,
        y,
        12,
        s.items[item.id] ? P.ink : P.muted,
      );
      text(ctx, `HELD ${s.items[item.id]}`, 700, y + 16, 10, P.muted);
    });
    if (over)
      text(
        ctx,
        C.OVERLOAD + " · DROP ORE TO CLIMB",
        284,
        602,
        12,
        P.red,
        "600",
      );
  }
  const panelOptions = controls(s).filter(
    (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
  );
  for (const c of controls(s).filter(
    (c) => c.y >= C.HUD_H && c.id !== "dismiss-notice",
  ))
    button(
      ctx,
      c,
      c.label,
      c.enabled &&
        panelOptions[s.panelFocus ?? 0]?.id === c.id &&
        panelOptions[s.panelFocus ?? 0]?.subject === c.subject,
      c.enabled,
    );
  text(
    ctx,
    "↑↓ SELECT · ENTER CONFIRM · ESC CLOSE · SUPPLIES 1—6",
    280,
    630,
    10,
    P.muted,
  );
}

function titleScene(s: StateView, ctx: Context): void {
  image(s, ctx, "surface/sky.png", 0, 0, 1280, 720);
  // An asset-built cutaway, with a shaft down its center and lit mineral seams.
  ctx.save();
  ctx.beginPath();
  ctx.rect(730, 290, 550, 430);
  ctx.clip();
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 8; col++) {
      const x = 720 + col * 80,
        y = 290 + row * 80,
        band = C.BANDS[Math.min(3, Math.floor(row / 2))];
      image(s, ctx, `tiles/${band}-${(row + col) % 3}.png`, x, y, 80, 80);
      if (col === 3 || (col === 4 && row === 3)) {
        image(s, ctx, "tiles/tunnel.png", x + 7, y, 66, 80);
      } else if ((col + row * 3) % 5 === 0)
        image(
          s,
          ctx,
          `ore/${C.ORE_IDS[(row * 2 + col) % 10]}.png`,
          x,
          y,
          80,
          80,
        );
    }
  ctx.restore();
  image(s, ctx, "surface/ground.png", 730, 282, 550, 24);
  image(s, ctx, "surface/upgrade-shop.png", 1035, 154, 230, 161);
  image(s, ctx, "surface/fuel-depot.png", 741, 177, 200, 140);
  // The featured character is enlarged with nearest-neighbor sampling, retaining authored pixels.
  miner(s, ctx, 892, 355, 232, "drill-down");
  const fade = ctx.createLinearGradient(600, 0, 1020, 0);
  fade.addColorStop(0, "#0b1720");
  fade.addColorStop(1, "#0b172000");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1280, 720);
  const bottom = ctx.createLinearGradient(0, 500, 0, 720);
  bottom.addColorStop(0, "#0b172000");
  bottom.addColorStop(1, "#0b1720e8");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 500, 1280, 220);
}

function menus(s: StateView, ctx: Context): void {
  const isTitle = s.screen === "title";
  if (
    isTitle ||
    ["mode-select", "size-select", "how-to-play"].includes(s.screen)
  )
    titleScene(s, ctx);
  if (!isTitle) {
    ctx.fillStyle = "#081721dc";
    ctx.fillRect(0, 0, 1280, 720);
  }
  text(ctx, "D / C", 84, 65, 22, P.amber, "700", "sans-serif");
  line(ctx, 164, 56, 263, 56, "#56716f");
  text(ctx, "EXOPLANET MINING DIVISION", 282, 61, 10, P.muted);
  text(ctx, "SECTOR 04   /   SIGNAL LOST", 942, 61, 10, P.muted);
  if (isTitle) {
    text(ctx, "A LONG WAY DOWN. ONE WAY HOME.", 84, 176, 12, P.amber, "600");
    text(ctx, C.TITLE_TEXT, 76, 294, 111, P.ink, "900", "sans-serif");
    ctx.fillStyle = P.amber;
    ctx.fillRect(84, 321, 52, 4);
    paragraphs(
      ctx,
      [
        "Dig deep. Haul heavy. Make it back.",
        "Turn the planet beneath your boots into your ticket home.",
      ],
      84,
      366,
      20,
      P.muted,
      30,
    );
    box(ctx, 884, 608, 300, 54, "#112731e6", "#456368", 3);
    text(ctx, "DEPTH IS CHEAP.", 902, 630, 12, P.amber, "600");
    text(ctx, "HEIGHT IS EXPENSIVE.", 902, 651, 12, P.ink, "600");
    text(ctx, "01 / THE PROSPECTOR", 917, 344, 10, P.amber);
  } else if (s.screen === "mode-select") {
    text(ctx, "CHOOSE YOUR STAKES", 84, 168, 12, P.amber, "600");
    text(
      ctx,
      "The rock is unforgiving.",
      80,
      242,
      51,
      P.ink,
      "700",
      "sans-serif",
    );
    paragraphs(ctx, ["Two ways to face the same descent."], 84, 286, 19);
    box(ctx, 540, 340, 620, 166, "#132b35", "#3b5861", 4);
    text(ctx, "STANDARD", 566, 373, 15, P.teal, "600");
    text(
      ctx,
      "A death lets you restore the expedition from your last save.",
      566,
      400,
      17,
      P.ink,
      "400",
      "sans-serif",
    );
    text(ctx, "HARDCORE", 566, 448, 15, P.red, "600");
    text(
      ctx,
      "A death deletes the save and ends the expedition.",
      566,
      476,
      17,
      P.ink,
      "400",
      "sans-serif",
    );
  } else if (s.screen === "size-select") {
    text(ctx, "CHOOSE YOUR DESCENT", 84, 168, 12, P.amber, "600");
    text(ctx, "How far is home?", 80, 242, 58, P.ink, "700", "sans-serif");
    text(
      ctx,
      `${s.mode.toUpperCase()} EXPEDITION  /  ALL DEPTHS HOLD THE SAME DANGERS`,
      84,
      287,
      13,
      P.muted,
    );
    C.WORLD_SIZES.forEach((size, i) => {
      const y = 370 + i * 60;
      line(ctx, 544, y - 3, 1140, y - 3);
      text(
        ctx,
        `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]) * C.METERS_PER_ROW} m`,
        567,
        y + 25,
        27,
        P.amber,
        "600",
        "sans-serif",
      );
      text(
        ctx,
        [
          "A compressed, high-stakes descent.",
          "The full Deepcore expedition.",
          "A long journey into the planet's heart.",
        ][i],
        753,
        y + 21,
        17,
        P.muted,
        "400",
        "sans-serif",
      );
    });
  } else if (s.screen === "how-to-play") {
    text(
      ctx,
      "FIELD MANUAL  /  READ BEFORE DESCENT",
      84,
      139,
      12,
      P.amber,
      "600",
    );
    text(ctx, "Earn your way home.", 80, 205, 51, P.ink, "700", "sans-serif");
    const sections = [
      [
        "01  DIG & RETURN",
        [
          "A / D move and drill sideways. S drills down.",
          "W / Space fires your jetpack. You cannot drill up.",
          "Fuel pays for the climb. Turn back before it runs out.",
        ],
      ],
      [
        "02  SELL & BUILD",
        [
          "E opens surface stations. Sell ore, refuel, upgrade.",
          "Build all five rocket systems at the Launch Pad.",
          "I opens cargo. Slots fill up; weight can stop your lift.",
        ],
      ],
      [
        "03  READ THE ROCK",
        [
          "Gas wisps betray explosions. Lava burns. Falls hurt.",
          "Buy a scanner to find Resonite and Cryenite.",
          "Extract the Core Sample, then race its 90-second clock.",
        ],
      ],
      [
        "04  KEEP WHAT YOU EARN",
        [
          "Use the Save Pad. No autosaves. No saving live Samples.",
          "Standard restores your last save; Hardcore erases it on death.",
          "1—6 use supplies. J jettisons a Sample. Esc pauses. M mutes.",
        ],
      ],
    ];
    sections.forEach(([heading, body], i) => {
      const x = i % 2 ? 687 : 84,
        y = 267 + Math.floor(i / 2) * 163;
      text(ctx, heading as string, x, y, 13, P.amber, "600");
      paragraphs(ctx, body as string[], x, y + 32, 16, P.ink, 28);
    });
  } else if (s.screen === "paused") {
    text(ctx, "EXPEDITION ON HOLD", 84, 169, 12, P.amber, "600");
    text(ctx, "Take a breath.", 80, 251, 65, P.ink, "700", "sans-serif");
    text(
      ctx,
      "The mine will wait. Your fuel will not refill.",
      84,
      294,
      19,
      P.muted,
      "400",
      "sans-serif",
    );
  } else {
    const won = s.screen === "victory";
    text(
      ctx,
      won ? "EXTRACTION COMPLETE" : "EXPEDITION LOST",
      84,
      170,
      12,
      won ? P.teal : P.red,
      "600",
    );
    text(
      ctx,
      won ? "You made it home." : "The mine keeps its due.",
      80,
      247,
      60,
      P.ink,
      "700",
      "sans-serif",
    );
    const sum = s.summary;
    if (sum) {
      const values = [
        [
          "DEEPEST REACHED",
          `${Math.floor(sum.deepestDepthMeters).toLocaleString()} m`,
        ],
        ["CREDITS EARNED", `${sum.creditsEarned.toLocaleString()} CR`],
        [
          "TIME BELOW",
          `${Math.floor(sum.elapsedSeconds / 60)}m ${Math.floor(sum.elapsedSeconds % 60)}s`,
        ],
        ["ROCKET SYSTEMS", `${sum.componentsInstalled}/5`],
      ];
      values.forEach(([label, value], i) => {
        const x = 84 + i * 284;
        line(ctx, x, 314, x + 240, 314);
        text(ctx, label, x, 343, 11, P.muted);
        text(ctx, value, x, 385, 32, P.amber, "600", "sans-serif");
      });
      text(
        ctx,
        `${sum.mode.toUpperCase()}${sum.deathCause ? `  /  ${sum.deathCause.replace(/-/g, " ").toUpperCase()}` : "  /  THE SKY IS YOURS"}`,
        84,
        440,
        13,
        won ? P.teal : P.red,
      );
    }
  }
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (r) button(ctx, r, item, i === s.menuIndex);
  });
  text(ctx, "↑ ↓ SELECT    ENTER CONFIRM", 84, 689, 10, P.muted);
  text(ctx, "ORIGINAL EXPEDITION  /  DEEPCORE", 946, 689, 10, P.muted);
}

export function render(s: StateView, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (["in-mine", "paused", "game-over", "victory"].includes(s.screen)) {
    world(s, ctx);
    if (s.screen === "in-mine") {
      worldLabels(s, ctx);
      hud(s, ctx);
      panel(s, ctx);
    }
  }
  if (s.screen !== "in-mine") menus(s, ctx);
}
