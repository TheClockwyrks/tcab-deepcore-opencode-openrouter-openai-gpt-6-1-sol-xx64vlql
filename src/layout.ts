import * as C from "./constants";
import { cargo, maxFuel, maxHull, type Rect, type StateView } from "./model";

export interface Control extends Rect {
  id: string;
  subject: string | null;
  label: string;
  detail: string;
  enabled: boolean;
}
export function noticeRect(s: StateView): Rect {
  return {
    x: 350,
    y: s.miner.y - s.camera.y + C.HUD_H > 500 ? 422 : 566,
    w: 580,
    h: 90,
  };
}
export function menuItems(s: StateView): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: StateView, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  const y =
    s.screen === "title"
      ? 435
      : s.screen === "how-to-play"
        ? 623
        : s.screen === "victory" || s.screen === "game-over"
          ? 500
          : 340;
  return { x: 84, y: y + index * 60, w: 370, h: 48 };
}
export function controls(s: StateView): Control[] {
  if (s.screen !== "in-mine") return [];
  const out: Control[] = [];
  const add = (
    id: string,
    subject: string | null,
    label: string,
    x: number,
    y: number,
    w = 160,
    enabled = true,
    detail = "",
  ) => out.push({ id, subject, label, x, y, w, h: 36, enabled, detail });
  add("inventory", null, "BAY [I]", 1010, 10, 98);
  add("mute", null, s.muted ? "OFF [M]" : "SND [M]", 1116, 10, 78);
  add("pause", null, "II", 1202, 10, 54);
  if (s.notice?.shown)
    out.push({
      ...noticeRect(s),
      id: "dismiss-notice",
      subject: null,
      label: "DISMISS",
      detail: "",
      enabled: true,
    });
  if (!s.panel) return out;
  const x = 288,
    y = 205;
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        null,
        `+${C.FUEL_BUY_INCREMENT} FUEL`,
        x,
        y,
        238,
        s.miner.fuel < maxFuel(s) &&
          s.credits >=
            Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
              C.FUEL_PRICE,
        `${C.FUEL_PRICE} CR / unit`,
      );
      add(
        "fill-fuel",
        null,
        "FILL TANK",
        x + 320,
        y,
        238,
        s.miner.fuel < maxFuel(s) && s.credits > 0,
        "Pay only for fuel needed",
      );
      add(
        "buy-repair",
        null,
        `+${C.REPAIR_BUY_INCREMENT} HULL`,
        x,
        y + 105,
        238,
        s.miner.hull < maxHull(s) &&
          s.credits >=
            Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
              C.REPAIR_PRICE,
        `${C.REPAIR_PRICE} CR / point`,
      );
      add(
        "repair-full",
        null,
        "REPAIR FULL",
        x + 320,
        y + 105,
        238,
        s.miner.hull < maxHull(s) && s.credits > 0,
        "Restore pressure integrity",
      );
      break;
    case "ore-market":
      add("sell", null, C.SELL, 760, 560, 180, cargo(s).slotsUsed > 0);
      break;
    case "upgrade-shop":
      C.TRACKS.forEach((track, i) => {
        const tier = s.tiers[track];
        add(
          "buy-upgrade",
          track,
          tier >= C.MAX_TIER[track]
            ? "MAX TIER"
            : `${C.UPGRADE_PRICES[tier - 1]} CR`,
          790,
          190 + i * 52,
          170,
          tier < C.MAX_TIER[track] && s.credits >= C.UPGRADE_PRICES[tier - 1],
        );
      });
      break;
    case "supply-depot":
      C.ITEMS.forEach((item, i) =>
        add(
          "buy-item",
          item.id,
          `${item.price.toLocaleString()} CR`,
          790,
          200 + i * 57,
          170,
          s.credits >= item.price,
        ),
      );
      break;
    case "launch-pad": {
      const c = C.ROCKET_COMPONENTS[s.installed];
      if (c)
        add(
          "fabricate",
          null,
          C.FABRICATE,
          744,
          557,
          215,
          s.credits >= c.credits &&
            (!c.material ||
              (c.material === "core-sample"
                ? s.satchel.coreSample
                : s.satchel[c.material] > 0)),
        );
      else add("launch", null, C.LAUNCH, 744, 557, 215);
      break;
    }
    case "inventory": {
      C.MINERALS.filter((m) => (s.ore[m.id] ?? 0) > 0).forEach((m, i) =>
        add("drop-ore", m.id, "DROP 1", 535, 190 + i * 27, 80, true),
      );
      out
        .filter((c) => c.id === "drop-ore")
        .forEach((c) => {
          c.h = 24;
        });
      C.ITEMS.forEach((item, i) => {
        if (s.items[item.id])
          add("use-item", item.id, C.USE, 890, 270 + i * 44, 74);
      });
      if (s.satchel.coreSample)
        add("jettison", null, C.JETTISON, 720, 570, 240);
      break;
    }
  }
  add("pause", null, "CLOSE [ESC]", 792, 119, 174);
  return out;
}
export function controlRect(
  s: StateView,
  id: string,
  subject: string | null,
): Rect | null {
  const c = controls(s).find((c) => c.id === id && c.subject === subject);
  return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null;
}
export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
