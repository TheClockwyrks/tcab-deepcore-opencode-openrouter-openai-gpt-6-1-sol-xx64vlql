import * as C from "./constants";
import {
  cargo,
  clamp,
  depth,
  grounded,
  maxFuel,
  minable,
  put,
  tile,
  type DeepcoreState,
} from "./model";
import {
  breakCell,
  checkDeath,
  cue,
  damage,
  effect,
  extract,
  finish,
} from "./operations";
import { debrisTint } from "./palette";

export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
export function followCamera(s: DeepcoreState, dt: number): void {
  const m = s.miner,
    target =
      Math.abs(m.vy) <= C.CAM_STILL_SPEED
        ? 0
        : Math.sign(m.vy) * C.CAM_LEAD_MAX;
  let lead = s.camera.lead;
  const rate = C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP;
  let remaining = dt;
  if (lead * target < 0) {
    const unwind = Math.min(
      Math.abs(lead),
      remaining * rate * C.CAM_UNWIND_MULT,
    );
    lead -= Math.sign(lead) * unwind;
    remaining -= unwind / (rate * C.CAM_UNWIND_MULT);
  }
  const speed =
    rate * (Math.abs(target) < Math.abs(lead) ? C.CAM_UNWIND_MULT : 1);
  lead += clamp(target - lead, -speed * remaining, speed * remaining);
  s.camera = {
    x: clamp(m.x + C.MINER_W / 2 - C.VIEW_W / 2, 0, C.WORLD_W - C.VIEW_W),
    y: Math.min(
      m.y + C.MINER_H / 2 - C.VIEW_H / 2 + lead,
      (s.coreRow + 1) * C.TILE - C.VIEW_H,
    ),
    lead,
  };
}

function collision(s: DeepcoreState, axis: "x" | "y", delta: number): boolean {
  const m = s.miner;
  if (!delta) return false;
  m[axis] += delta;
  let collided = false;
  const minCol = Math.floor(m.x / C.TILE),
    maxCol = Math.floor((m.x + C.MINER_W - 0.001) / C.TILE),
    minRow = Math.floor(m.y / C.TILE),
    maxRow = Math.floor((m.y + C.MINER_H - 0.001) / C.TILE);
  for (let row = minRow; row <= maxRow; row++)
    for (let col = minCol; col <= maxCol; col++) {
      const t = tile(s, col, row),
        top = row * C.TILE + (t.cutDepth ?? 0);
      if (
        t.kind === "tunnel" ||
        m.y + C.MINER_H <= top + 0.001 ||
        m.y >= (row + 1) * C.TILE
      )
        continue;
      if (axis === "x")
        m.x =
          delta > 0
            ? Math.min(m.x, col * C.TILE - C.MINER_W)
            : Math.max(m.x, (col + 1) * C.TILE);
      else
        m.y =
          delta > 0
            ? Math.min(m.y, top - C.MINER_H)
            : Math.max(m.y, (row + 1) * C.TILE);
      collided = true;
    }
  return collided;
}

function drilling(
  s: DeepcoreState,
  held: Held,
  dt: number,
  isGrounded: boolean,
): boolean {
  const m = s.miner;
  if (
    !m.drill ||
    m.fuel <= 0 ||
    held.up ||
    !isGrounded ||
    (m.travel && m.vy < -1)
  ) {
    m.drilling = null;
    s.hitClock = 0;
    return false;
  }
  let target = m.drilling;
  const dir = held.down
    ? "down"
    : held.left
      ? "left"
      : held.right
        ? "right"
        : null;
  if (target?.dir !== dir) target = null;
  if (!target && dir) {
    const col = Math.floor((m.x + C.MINER_W / 2) / C.TILE);
    if (dir === "down")
      target = {
        col,
        row: Math.floor((m.y + C.MINER_H + 0.001) / C.TILE),
        dir,
      };
    else {
      const edge = dir === "right" ? m.x + C.MINER_W : m.x;
      if (Math.abs(edge / C.TILE - Math.round(edge / C.TILE)) < 0.02) {
        const nextCol = Math.round(edge / C.TILE) - (dir === "left" ? 1 : 0);
        let row = Math.floor(m.y / C.TILE);
        const last = Math.floor((m.y + C.MINER_H - 0.001) / C.TILE);
        while (row < last) {
          const t = tile(s, nextCol, row);
          if (
            t.kind !== "tunnel" &&
            m.y + C.MINER_H > row * C.TILE + (t.cutDepth ?? 0)
          )
            break;
          row++;
        }
        target = { col: nextCol, row, dir };
      }
    }
  }
  if (!target) {
    m.drilling = null;
    s.hitClock = 0;
    return false;
  }
  const t = tile(s, target.col, target.row);
  if (t.kind === "core" && dir === "down") {
    m.drilling = target;
    if (s.coreTimer === null) {
      s.hitClock += dt;
      if (s.hitClock >= C.DRILL_HIT_INTERVAL) {
        m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
        extract(s);
        s.hitClock = 0;
      }
    }
    return true;
  }
  if (!minable(t.kind)) {
    m.drilling = null;
    s.hitClock = 0;
    return false;
  }
  m.drilling = target;
  s.hitClock += dt;
  if (s.hitClock + 1e-9 >= C.DRILL_HIT_INTERVAL) {
    s.hitClock -= C.DRILL_HIT_INTERVAL;
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const health = Math.max(
      0,
      (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1],
    );
    put(s, target.col, target.row, { ...t, health });
    if (health <= 0) {
      if (
        target.dir === "down" &&
        m.travel &&
        !["tunnel", "lava"].includes(tile(s, target.col, target.row + 1).kind)
      )
        m.y = (target.row + 1) * C.TILE - C.MINER_H;
      breakCell(s, target.col, target.row);
      m.drilling = null;
    }
  }
  if (m.travel && target.dir === "down") {
    const current = tile(s, target.col, target.row),
      below = tile(s, target.col, target.row + 1);
    if (
      current.health !== null &&
      current.maxHealth &&
      !["tunnel", "lava"].includes(below.kind)
    ) {
      // Interpolate within each hit interval, while the cell's authoritative damage remains discrete.
      const progress = clamp(
        1 -
          current.health / current.maxHealth +
          ((s.hitClock / C.DRILL_HIT_INTERVAL) *
            C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
            current.maxHealth,
        0,
        1,
      );
      const cutDepth = Math.max(current.cutDepth ?? 0, progress * C.TILE);
      put(s, target.col, target.row, { ...current, cutDepth });
      m.y = target.row * C.TILE - C.MINER_H + cutDepth;
    }
    if (m.drilling) m.vy = 0;
  }
  return true;
}

function timers(s: DeepcoreState, dt: number): void {
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (s.coreTimer <= 1e-9) {
      const ground = s.coreGround,
        x = ground ? (ground.col + 0.5) * C.TILE : s.miner.x + C.MINER_W / 2,
        y = ground ? (ground.row + 0.5) * C.TILE : s.miner.y + C.MINER_H / 2;
      effect(s, "core-detonation", x, y);
      s.shake = 32;
      cue(s, C.CUES.gasExplosion);
      const lethal =
        s.satchel.coreSample ||
        Math.hypot(
          s.miner.x + C.MINER_W / 2 - x,
          s.miner.y + C.MINER_H / 2 - y,
        ) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (lethal) finish(s, "core-detonation");
    }
  }
  if (s.notice) {
    s.notice.age += dt;
    s.notice.shown = s.notice.age + 1e-9 >= C.NOTICE_DELAY;
    if (s.notice.age >= C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  s.alarmClock += dt;
  const period = s.coreTimer !== null ? clamp(s.coreTimer / 30, 0.15, 1.5) : 2;
  if (s.alarmClock >= period) {
    s.alarmClock = 0;
    if (s.coreTimer !== null) cue(s, C.CUES.alarmCore);
    else if (s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION)
      cue(s, C.CUES.alarmFuel);
  }
}

export function step(s: DeepcoreState, held: Held, dt: number): void {
  if (s.screen !== "in-mine") return;
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  timers(s, dt);
  if (s.screen !== "in-mine") return;
  if (s.launchTime !== null) {
    const previous = s.launchTime;
    s.launchTime += dt;
    if (Math.floor(s.launchTime * 4) !== Math.floor(previous * 4))
      effect(s, "launch-exhaust", 1850, C.SURFACE_Y - s.launchTime ** 2 * 100);
    if (s.launchTime >= 3.6) finish(s, null);
    return;
  }
  s.hurt = Math.max(0, s.hurt - dt);
  if (s.panel) {
    checkDeath(s);
    followCamera(s, dt);
    return;
  }
  const m = s.miner,
    wasGrounded = grounded(s),
    dir = held.right - held.left,
    thrust = held.up > 0 && m.fuel > 0;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  const cutting = drilling(s, held, dt, wasGrounded);
  const bracedDown = cutting && held.down > 0 && m.drilling !== null;
  const haul = cargo(s),
    load = haul.loadKg / haul.liftLimitKg,
    jet = C.JETPACK_TIERS[s.tiers.jetpack - 1];
  if (m.travel) {
    if (s.hurt <= 0) m.vx = bracedDown ? 0 : dir * C.WALK_SPEED;
    if (!bracedDown) {
      if (thrust)
        m.vy = Math.max(
          -jet.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jet.emptyAccel * Math.max(0, 1 - load) * dt,
        );
      else
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
    }
    collision(s, "x", m.vx * dt);
    m.x = clamp(m.x, 0, C.WORLD_W - C.MINER_W);
    if (!bracedDown) {
      const speed = m.vy;
      if (collision(s, "y", m.vy * dt)) {
        m.vy = 0;
        if (speed > C.IMPACT_SAFE_SPEED) {
          const amount = (speed - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
          damage(s, amount);
          effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
          cue(s, C.CUES.impact);
          s.shake = Math.max(3, amount * 0.25);
        }
      }
    }
  }
  let burn = depth(s) > 0 ? C.LIFE_SUPPORT_BURN : 0;
  if (thrust)
    burn +=
      (C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
      C.THRUST_BURN_SIZE_MULT[s.worldSize];
  if (dir && !wasGrounded) burn += C.AIR_BURN;
  m.fuel = Math.max(0, m.fuel - burn * dt);
  for (
    let row = Math.floor(m.y / C.TILE);
    row <= Math.floor((m.y + C.MINER_H - 0.001) / C.TILE);
    row++
  )
    for (
      let col = Math.floor(m.x / C.TILE);
      col <= Math.floor((m.x + C.MINER_W - 0.001) / C.TILE);
      col++
    ) {
      if (
        tile(s, col, row).kind === "lava" &&
        !(m.drilling?.col === col && m.drilling.row === row)
      ) {
        damage(
          s,
          C.LAVA_CONTACT_DPS *
            (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) *
            dt,
          "lava",
        );
        if (
          Math.floor(s.elapsedSeconds * 5) !==
          Math.floor((s.elapsedSeconds - dt) * 5)
        ) {
          effect(s, "lava-embers");
          cue(s, C.CUES.lavaSizzle);
        }
      }
    }
  let animation: C.MinerState = cutting
    ? held.down
      ? "drill-down"
      : "drill-side"
    : s.hurt > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : dir
              ? "walk"
              : "idle";
  if (s.screen !== "in-mine") animation = m.state;
  if (animation !== m.state) s.animTime = 0;
  else s.animTime += dt;
  m.state = animation;
  if (
    Math.floor(s.elapsedSeconds * 10) !==
    Math.floor((s.elapsedSeconds - dt) * 10)
  ) {
    if (cutting) {
      const d = m.drilling;
      effect(
        s,
        "drill-debris",
        m.x + (held.down ? C.MINER_W / 2 : m.facing === "east" ? C.MINER_W : 0),
        m.y + (held.down ? C.MINER_H : 42),
        debrisTint[(d ? tile(s, d.col, d.row).band : null) ?? "topsoil"],
      );
    }
    if (thrust)
      effect(
        s,
        "jetpack-exhaust",
        m.x + (m.facing === "east" ? 12 : C.MINER_W - 12),
        m.y + 57,
      );
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  followCamera(s, dt);
  checkDeath(s);
  if (s.summary && m.fuel <= 0) m.state = "fuel-out";
  if (
    Math.floor(s.elapsedSeconds / C.GAS_SEEP_PERIOD) !==
    Math.floor((s.elapsedSeconds - dt) / C.GAS_SEEP_PERIOD)
  ) {
    const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE)),
      maxRow = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
    for (let row = minRow; row <= maxRow; row++)
      for (
        let col = Math.floor(s.camera.x / C.TILE);
        col < Math.ceil((s.camera.x + C.VIEW_W) / C.TILE);
        col++
      )
        if (tile(s, col, row).kind === "gas")
          effect(s, "gas-seep", (col + 0.5) * C.TILE, (row + 0.5) * C.TILE);
  }
}
