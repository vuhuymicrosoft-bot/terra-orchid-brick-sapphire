export const H = 48;
export const CS = 16;
export const CW = 16;
export const SEA = 18;
export const DAY = 240;
export const REACH = 5.15;
export const HOTBAR = 9;
export const SLOTS = 36;
export const CHEST_SLOTS = 18;

export const B = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  sandstone: 5,
  snow: 6,
  ice: 7,
  log: 8,
  leaves: 9,
  planks: 10,
  cobble: 11,
  coalOre: 12,
  copper: 13,
  iron: 14,
  crystal: 15,
  bedrock: 16,
  water: 17,
  torch: 18,
  bench: 19,
  furnace: 20,
  chest: 21,
  glass: 22,
  brick: 23,
  ladder: 24,
  cactus: 25,
  slog: 26,
  sleaves: 27,
  gravel: 28,
  clay: 29,
  tallgrass: 30,
  flower: 31,
  bush: 32,
  lamp: 33,
  bed: 34,
  door: 35,
  doorOpen: 36,
  heart: 37,
} as const;

export const I = {
  stick: 40,
  woodPick: 41,
  stonePick: 42,
  ironPick: 43,
  crystalPick: 44,
  woodAxe: 45,
  stoneAxe: 46,
  ironAxe: 47,
  woodShovel: 48,
  stoneShovel: 49,
  ironShovel: 50,
  woodSword: 51,
  stoneSword: 52,
  ironSword: 53,
  crystalSword: 54,
  gel: 55,
  coal: 56,
  apple: 57,
  copperIngot: 58,
  ironIngot: 59,
  copperPick: 60,
  copperAxe: 61,
  copperShovel: 62,
  copperSword: 63,
} as const;

export type ToolKind = "hand" | "pick" | "axe" | "shovel" | "sword";
export type Station = "hand" | "bench" | "furnace";
export type Biome = "meadow" | "desert" | "snow";

export interface BlockDef {
  name: string;
  solid: boolean;
  opaque: boolean;
  liquid: boolean;
  place: boolean;
  hardness: number;
  tool: "any" | "pick" | "axe" | "shovel" | "none";
  emit: number;
  climb: boolean;
  hurt: number;
  replace: boolean;
  color: string;
}

export interface ToolStats {
  kind: ToolKind;
  tier: number;
  speed: number;
  dmg: number;
  dura: number;
}

export interface Stack {
  id: number;
  n: number;
  dura: number;
}

export interface Recipe {
  id: string;
  out: number;
  n: number;
  need: ReadonlyArray<readonly [number, number]>;
  station: Station;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const HAND: ToolStats = { kind: "hand", tier: 0, speed: 1, dmg: 1, dura: 0 };

const TOOLS: Record<number, ToolStats> = {
  [I.woodPick]: { kind: "pick", tier: 1, speed: 2.5, dmg: 2, dura: 90 },
  [I.stonePick]: { kind: "pick", tier: 2, speed: 4.2, dmg: 3, dura: 180 },
  [I.copperPick]: { kind: "pick", tier: 3, speed: 5.3, dmg: 3, dura: 250 },
  [I.ironPick]: { kind: "pick", tier: 3, speed: 6.4, dmg: 4, dura: 360 },
  [I.crystalPick]: { kind: "pick", tier: 4, speed: 9, dmg: 5, dura: 760 },
  [I.woodAxe]: { kind: "axe", tier: 1, speed: 2.5, dmg: 3, dura: 90 },
  [I.stoneAxe]: { kind: "axe", tier: 2, speed: 4.2, dmg: 4, dura: 180 },
  [I.copperAxe]: { kind: "axe", tier: 3, speed: 5.3, dmg: 4, dura: 250 },
  [I.ironAxe]: { kind: "axe", tier: 3, speed: 6.4, dmg: 5, dura: 360 },
  [I.woodShovel]: { kind: "shovel", tier: 1, speed: 2.6, dmg: 2, dura: 90 },
  [I.stoneShovel]: { kind: "shovel", tier: 2, speed: 4.4, dmg: 2, dura: 180 },
  [I.copperShovel]: { kind: "shovel", tier: 3, speed: 5.5, dmg: 2, dura: 250 },
  [I.ironShovel]: { kind: "shovel", tier: 3, speed: 6.6, dmg: 3, dura: 360 },
  [I.woodSword]: { kind: "sword", tier: 1, speed: 1.5, dmg: 4, dura: 90 },
  [I.stoneSword]: { kind: "sword", tier: 2, speed: 1.6, dmg: 5, dura: 180 },
  [I.copperSword]: { kind: "sword", tier: 3, speed: 1.65, dmg: 6, dura: 250 },
  [I.ironSword]: { kind: "sword", tier: 3, speed: 1.7, dmg: 7, dura: 360 },
  [I.crystalSword]: { kind: "sword", tier: 4, speed: 1.8, dmg: 9, dura: 760 },
};

export function toolInfo(id: number): ToolStats {
  return TOOLS[id] ?? HAND;
}

export function isTool(id: number): boolean {
  return id in TOOLS;
}

export function maxStack(id: number): number {
  return isTool(id) ? 1 : 64;
}

export function foodHeal(id: number): number {
  if (id === I.gel) return 4;
  if (id === I.apple) return 3;
  return 0;
}

function def(
  name: string,
  color: string,
  extra: Partial<BlockDef> = {},
): BlockDef {
  return {
    name,
    solid: true,
    opaque: true,
    liquid: false,
    place: true,
    hardness: 1,
    tool: "any",
    emit: 0,
    climb: false,
    hurt: 0,
    replace: false,
    color,
    ...extra,
  };
}

export const BLOCKS: Record<number, BlockDef> = {
  [B.grass]: def("Cỏ", "#63b34a", { hardness: 0.5, tool: "shovel" }),
  [B.dirt]: def("Đất", "#8a5a32", { hardness: 0.48, tool: "shovel" }),
  [B.stone]: def("Đá", "#8b8e96", { hardness: 2.15, tool: "pick" }),
  [B.sand]: def("Cát", "#e4d0a0", { hardness: 0.45, tool: "shovel" }),
  [B.sandstone]: def("Đá cát", "#c9b488", { hardness: 2, tool: "pick" }),
  [B.snow]: def("Tuyết", "#f2f6fb", { hardness: 0.35, tool: "shovel" }),
  [B.ice]: def("Băng", "#b7def0", { hardness: 0.55, tool: "pick" }),
  [B.log]: def("Gỗ sồi", "#6d4528", { hardness: 0.8, tool: "axe" }),
  [B.leaves]: def("Lá sồi", "#2f8a3c", {
    solid: false,
    opaque: false,
    hardness: 0.22,
    tool: "any",
  }),
  [B.planks]: def("Ván gỗ", "#c49658", { hardness: 0.7, tool: "axe" }),
  [B.cobble]: def("Đá cuội", "#7c7f88", { hardness: 1.9, tool: "pick" }),
  [B.coalOre]: def("Quặng than", "#5c5f68", { hardness: 2.3, tool: "pick" }),
  [B.copper]: def("Quặng đồng", "#b8743e", { hardness: 2.4, tool: "pick" }),
  [B.iron]: def("Quặng sắt", "#c9b7a4", { hardness: 2.9, tool: "pick" }),
  [B.crystal]: def("Tinh thể", "#6ed8cf", { hardness: 3.4, tool: "pick" }),
  [B.bedrock]: def("Đáy khe", "#2c2e34", { place: false, hardness: Infinity, tool: "none" }),
  [B.water]: def("Nước", "#3a8ec8", {
    solid: false,
    opaque: false,
    liquid: true,
    place: false,
    hardness: Infinity,
    tool: "none",
  }),
  [B.torch]: def("Đuốc", "#e8943a", {
    solid: false,
    opaque: false,
    hardness: 0.05,
    emit: 14,
    tool: "any",
  }),
  [B.bench]: def("Bàn chế", "#b8884e", { hardness: 0.75, tool: "axe" }),
  [B.furnace]: def("Lò nung", "#6a6d74", { hardness: 2.6, tool: "pick" }),
  [B.chest]: def("Rương", "#a8743e", { hardness: 0.8, tool: "axe" }),
  [B.glass]: def("Kính", "#d5f1fb", { opaque: false, hardness: 0.28, tool: "any" }),
  [B.brick]: def("Gạch", "#a44b3a", { hardness: 2.2, tool: "pick" }),
  [B.ladder]: def("Thang", "#b88858", {
    solid: false,
    opaque: false,
    climb: true,
    hardness: 0.35,
    tool: "axe",
  }),
  [B.cactus]: def("Xương rồng", "#2f7a3a", { hardness: 0.35, tool: "any", hurt: 1 }),
  [B.slog]: def("Gỗ thông", "#4e6248", { hardness: 0.8, tool: "axe" }),
  [B.sleaves]: def("Lá thông", "#1f6b48", {
    solid: false,
    opaque: false,
    hardness: 0.22,
  }),
  [B.gravel]: def("Sỏi", "#9a9388", { hardness: 0.5, tool: "shovel" }),
  [B.clay]: def("Đất sét", "#9a7d78", { hardness: 0.5, tool: "shovel" }),
  [B.tallgrass]: def("Cỏ cao", "#3e9a4a", {
    solid: false,
    opaque: false,
    place: false,
    replace: true,
    hardness: 0.02,
  }),
  [B.flower]: def("Hoa khe", "#e25b78", {
    solid: false,
    opaque: false,
    place: false,
    replace: true,
    hardness: 0.02,
  }),
  [B.bush]: def("Bụi khô", "#a48448", {
    solid: false,
    opaque: false,
    place: false,
    replace: true,
    hardness: 0.02,
  }),
  [B.lamp]: def("Đèn đồng", "#e0a050", {
    solid: false,
    opaque: false,
    emit: 15,
    hardness: 0.3,
    tool: "pick",
  }),
  [B.bed]: def("Giường rêu", "#c45b6e", { hardness: 0.45, tool: "axe" }),
  [B.door]: def("Cửa gỗ", "#a87848", { hardness: 0.7, tool: "axe" }),
  [B.doorOpen]: def("Cửa mở", "#a87848", {
    solid: false,
    opaque: false,
    place: false,
    hardness: 0.7,
    tool: "axe",
  }),
  [B.heart]: def("Tim khe", "#5ee0d0", {
    place: false,
    hardness: 7.2,
    tool: "pick",
    emit: 12,
  }),
};

export function blockDef(id: number): BlockDef | null {
  return BLOCKS[id] ?? null;
}

export function itemName(id: number): string {
  if (BLOCKS[id]) return BLOCKS[id].name;
  const names: Record<number, string> = {
    [I.stick]: "Que gỗ",
    [I.woodPick]: "Cuốc gỗ",
    [I.stonePick]: "Cuốc đá",
    [I.ironPick]: "Cuốc sắt",
    [I.crystalPick]: "Cuốc tinh thể",
    [I.woodAxe]: "Rìu gỗ",
    [I.stoneAxe]: "Rìu đá",
    [I.ironAxe]: "Rìu sắt",
    [I.woodShovel]: "Xẻng gỗ",
    [I.stoneShovel]: "Xẻng đá",
    [I.ironShovel]: "Xẻng sắt",
    [I.woodSword]: "Kiếm gỗ",
    [I.stoneSword]: "Kiếm đá",
    [I.ironSword]: "Kiếm sắt",
    [I.crystalSword]: "Kiếm tinh thể",
    [I.gel]: "Gel rêu",
    [I.coal]: "Than",
    [I.apple]: "Táo rừng",
    [I.copperIngot]: "Thỏi đồng",
    [I.ironIngot]: "Thỏi sắt",
    [I.copperPick]: "Cuốc đồng",
    [I.copperAxe]: "Rìu đồng",
    [I.copperShovel]: "Xẻng đồng",
    [I.copperSword]: "Kiếm đồng",
  };
  return names[id] ?? "Vật phẩm";
}

export const RECIPES: Recipe[] = [
  { id: "planks", out: B.planks, n: 4, need: [[B.log, 1]], station: "hand" },
  { id: "planks-s", out: B.planks, n: 4, need: [[B.slog, 1]], station: "hand" },
  { id: "sticks", out: I.stick, n: 4, need: [[B.planks, 2]], station: "hand" },
  { id: "wpick", out: I.woodPick, n: 1, need: [[B.planks, 3], [I.stick, 2]], station: "hand" },
  { id: "waxe", out: I.woodAxe, n: 1, need: [[B.planks, 3], [I.stick, 2]], station: "hand" },
  { id: "wshovel", out: I.woodShovel, n: 1, need: [[B.planks, 1], [I.stick, 2]], station: "hand" },
  { id: "wsword", out: I.woodSword, n: 1, need: [[B.planks, 2], [I.stick, 1]], station: "hand" },
  { id: "bench", out: B.bench, n: 1, need: [[B.planks, 4]], station: "hand" },
  { id: "torch", out: B.torch, n: 4, need: [[I.coal, 1], [I.stick, 1]], station: "hand" },
  { id: "ladder", out: B.ladder, n: 3, need: [[I.stick, 2]], station: "hand" },
  { id: "spick", out: I.stonePick, n: 1, need: [[B.cobble, 3], [I.stick, 2]], station: "bench" },
  { id: "saxe", out: I.stoneAxe, n: 1, need: [[B.cobble, 3], [I.stick, 2]], station: "bench" },
  { id: "sshovel", out: I.stoneShovel, n: 1, need: [[B.cobble, 1], [I.stick, 2]], station: "bench" },
  { id: "ssword", out: I.stoneSword, n: 1, need: [[B.cobble, 2], [I.stick, 1]], station: "bench" },
  { id: "cupick", out: I.copperPick, n: 1, need: [[I.copperIngot, 3], [I.stick, 2]], station: "bench" },
  { id: "cuaxe", out: I.copperAxe, n: 1, need: [[I.copperIngot, 3], [I.stick, 2]], station: "bench" },
  { id: "cushovel", out: I.copperShovel, n: 1, need: [[I.copperIngot, 1], [I.stick, 2]], station: "bench" },
  { id: "cusword", out: I.copperSword, n: 1, need: [[I.copperIngot, 2], [I.stick, 1]], station: "bench" },
  { id: "ipick", out: I.ironPick, n: 1, need: [[I.ironIngot, 3], [I.stick, 2]], station: "bench" },
  { id: "iaxe", out: I.ironAxe, n: 1, need: [[I.ironIngot, 3], [I.stick, 2]], station: "bench" },
  { id: "ishovel", out: I.ironShovel, n: 1, need: [[I.ironIngot, 1], [I.stick, 2]], station: "bench" },
  { id: "isword", out: I.ironSword, n: 1, need: [[I.ironIngot, 2], [I.stick, 1]], station: "bench" },
  { id: "cpick", out: I.crystalPick, n: 1, need: [[B.crystal, 3], [I.stick, 2]], station: "bench" },
  { id: "csword", out: I.crystalSword, n: 1, need: [[B.crystal, 2], [I.stick, 1]], station: "bench" },
  { id: "furnace", out: B.furnace, n: 1, need: [[B.cobble, 8]], station: "bench" },
  { id: "chest", out: B.chest, n: 1, need: [[B.planks, 8]], station: "bench" },
  { id: "bed", out: B.bed, n: 1, need: [[B.planks, 3], [B.leaves, 2]], station: "bench" },
  { id: "door", out: B.door, n: 1, need: [[B.planks, 6]], station: "bench" },
  { id: "lamp", out: B.lamp, n: 1, need: [[I.copperIngot, 3], [I.stick, 1]], station: "bench" },
  { id: "cu-ingot", out: I.copperIngot, n: 1, need: [[B.copper, 1], [I.coal, 1]], station: "furnace" },
  { id: "fe-ingot", out: I.ironIngot, n: 1, need: [[B.iron, 1], [I.coal, 1]], station: "furnace" },
  { id: "glass", out: B.glass, n: 1, need: [[B.sand, 1], [I.coal, 1]], station: "furnace" },
  { id: "brick", out: B.brick, n: 1, need: [[B.clay, 1], [I.coal, 1]], station: "furnace" },
  { id: "smooth", out: B.stone, n: 1, need: [[B.cobble, 1], [I.coal, 1]], station: "furnace" },
];

export function stationLabel(s: Station): string {
  if (s === "hand") return "Tay không";
  if (s === "bench") return "Cần bàn chế gần bạn";
  return "Cần lò nung gần bạn";
}

export function itemColor(id: number): string {
  const b = BLOCKS[id];
  if (b) return b.color;
  if (id === I.gel) return "#8dce62";
  if (id === I.coal) return "#2a2e36";
  if (id === I.apple) return "#e25b4a";
  if (id === I.stick) return "#c4a06a";
  if (id === I.copperIngot) return "#e08a45";
  if (id === I.ironIngot) return "#d5d8df";
  if (id === I.crystalPick || id === I.crystalSword) return "#6ed8cf";
  if (id === I.ironPick || id === I.ironAxe || id === I.ironShovel || id === I.ironSword) return "#e4e0d8";
  if (id === I.copperPick || id === I.copperAxe || id === I.copperShovel || id === I.copperSword) return "#d98448";
  if (id === I.stonePick || id === I.stoneAxe || id === I.stoneShovel || id === I.stoneSword) return "#9aa0aa";
  return "#c49658";
}

export function itemMark(id: number): string {
  const k = toolInfo(id).kind;
  if (k === "pick") return "C";
  if (k === "axe") return "R";
  if (k === "shovel") return "X";
  if (k === "sword") return "K";
  if (id === I.gel) return "G";
  if (id === I.coal) return "T";
  if (id === I.apple) return "A";
  if (id === I.stick) return "Q";
  if (id === I.copperIngot || id === I.ironIngot) return "Th";
  return "";
}
