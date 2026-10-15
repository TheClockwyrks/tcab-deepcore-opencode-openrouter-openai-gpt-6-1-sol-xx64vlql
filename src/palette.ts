import type { BandName, OreId } from "./constants";

/** Shared art-direction colors for generated mineral and chip systems. */
export const mineralTint: Record<OreId, string> = {
  ferron: "#c19370",
  marlite: "#bdc9bb",
  cuprite: "#e58d59",
  argenite: "#c6e4e6",
  cobaltine: "#659bf1",
  voltite: "#c4df65",
  halcite: "#a190df",
  pyronium: "#ed7863",
  cindrite: "#e6b75e",
  adamite: "#9cf5e7",
  verdite: "#61eeab",
  roselite: "#ff80ab",
  aurite: "#ffe4a0",
};
export const debrisTint: Record<BandName, string> = {
  topsoil: "#b69574",
  rockbed: "#9bb2bb",
  deepstone: "#7089a7",
  coreshell: "#bc7563",
};
