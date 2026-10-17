// Original low-poly course layouts inspired by the N64 cups. Each course is a closed spline
// generated from harmonic radii (hand-tuned per course) so every track has its own shape,
// width, elevation, theme colours, hazards and decor. No ripped geometry.
function gen(seedPts, scale, yAmp, yFreq) {
  return seedPts.map(([x, z], i) => {
    const t = i / seedPts.length;
    return [x * scale, Math.sin(t * Math.PI * 2 * yFreq) * yAmp + Math.sin(t * Math.PI * 6 + 1) * yAmp * 0.25, z * scale];
  });
}
const SHAPES = {
  oval:   [[10,0],[8,5],[4,8],[-2,9],[-8,6],[-10,0],[-8,-6],[-2,-9],[4,-8],[9,-4]],
  peanut: [[10,0],[7,4],[3,3],[0,6],[-5,8],[-10,4],[-8,-3],[-3,-4],[1,-8],[7,-7]],
  kidney: [[10,2],[6,7],[0,5],[-4,8],[-10,3],[-7,-4],[-1,-5],[3,-9],[9,-6]],
  zigzag: [[10,0],[5,3],[8,7],[2,8],[-3,4],[-9,6],[-7,0],[-11,-5],[-4,-7],[1,-4],[6,-8]],
  hairpin:[[11,0],[6,2],[9,7],[3,9],[-2,5],[-6,9],[-10,4],[-6,-2],[-10,-7],[-3,-9],[3,-6],[8,-6]],
  loop8:  [[10,0],[6,6],[0,4],[-6,7],[-10,1],[-5,-3],[0,-8],[6,-7],[10,-3],[5,-1]],
  long:   [[13,0],[10,5],[5,4],[2,9],[-4,8],[-8,10],[-13,4],[-10,-3],[-13,-8],[-6,-10],[0,-7],[5,-10],[11,-6]],
  square: [[9,7],[2,9],[-7,8],[-10,2],[-8,-6],[-2,-9],[6,-9],[10,-3],[10,4]],
};
function T(id, name, cup, shape, scale, width, theme, extra = {}) {
  return { id, name, cup, width, points: gen(SHAPES[shape], scale, extra.yAmp ?? 2, extra.yFreq ?? 1),
    laps: 3, wall: extra.wall ?? false, fall: extra.fall ?? false, hazards: extra.hazards || [],
    boostPads: extra.boostPads || [0.35, 0.7], decor: extra.decor || 'tree', ...theme };
}
const TH = {
  raceway: { sky: 0x6ec6ff, fog: 0x9fd8ff, ground: 0x4fae3a, road: 0x8d8d94, edge: 0xe52521, off: 'grass' },
  farm:    { sky: 0x7ec8ff, fog: 0xbfe6ff, ground: 0x63b73d, road: 0xb98a56, edge: 0xffffff, off: 'grass' },
  beach:   { sky: 0x63c7ff, fog: 0xaee3ff, ground: 0xe8d28a, road: 0xd9b96a, edge: 0x3aa7d6, off: 'sand' },
  desert:  { sky: 0xffc37a, fog: 0xffd9a0, ground: 0xe0b96e, road: 0xc9a45e, edge: 0x8a6a34, off: 'sand' },
  highway: { sky: 0xff9d5c, fog: 0xffc49a, ground: 0x3d6b35, road: 0x4a4a52, edge: 0xf7d117, off: 'grass' },
  snow:    { sky: 0xaad4f5, fog: 0xd8ecff, ground: 0xeef6ff, road: 0xcfe2f2, edge: 0x5aa7e0, off: 'snow' },
  choco:   { sky: 0xffd9a8, fog: 0xf2c99a, ground: 0x8a5a33, road: 0xa06a3a, edge: 0x5e3a1c, off: 'dirt' },
  dirt:    { sky: 0x8fd0ff, fog: 0xc0e6ff, ground: 0x7a9a44, road: 0xa8845a, edge: 0xf7d117, off: 'dirt' },
  ice:     { sky: 0x9fd0f0, fog: 0xcfeaff, ground: 0xbfe2f5, road: 0xdff2ff, edge: 0x3f8fd2, off: 'ice' },
  castle:  { sky: 0x86c9ff, fog: 0xbfe0ff, ground: 0x57a83e, road: 0xb9b3a4, edge: 0xe58bb1, off: 'grass' },
  lava:    { sky: 0x2a1428, fog: 0x4a2038, ground: 0x3a3a42, road: 0x6a6a74, edge: 0xff7a2a, off: 'lava' },
  jungle:  { sky: 0x7ed0ff, fog: 0xaee8d8, ground: 0x2f7d33, road: 0xb98a56, edge: 0x2f9e68, off: 'grass' },
  valley:  { sky: 0xa8dcff, fog: 0xd0f0ff, ground: 0x5cab41, road: 0xc4a06a, edge: 0xe52521, off: 'grass' },
  ghost:   { sky: 0x1c2440, fog: 0x2c3a63, ground: 0x24304f, road: 0x8a6a4a, edge: 0x6a5acd, off: 'water' },
  rainbow: { sky: 0x0a0a2e, fog: 0x1a1a4e, ground: 0x0a0a2e, road: 0xffffff, edge: 0xffd84a, off: 'space', rainbow: true },
};
export const CUPS = [
  { id: 'mushroom', name: 'Mushroom Cup' }, { id: 'flower', name: 'Flower Cup' },
  { id: 'star', name: 'Star Cup' }, { id: 'special', name: 'Special Cup' },
];
export const TRACKS = [
  T('luigi',   'Luigi Raceway', 'mushroom', 'oval', 17, 15, TH.raceway, { wall: true, decor: 'tree', yAmp: 1 }),
  T('farm',    'Moo Moo Farm', 'mushroom', 'peanut', 15, 14, TH.farm, { hazards: ['mole'], decor: 'fence', yAmp: 3 }),
  T('beach',   'Koopa Troopa Beach', 'mushroom', 'kidney', 16, 15, TH.beach, { fall: true, hazards: ['crab'], decor: 'palm', yAmp: 1.5 }),
  T('desert',  'Kalimari Desert', 'mushroom', 'loop8', 17, 14, TH.desert, { hazards: ['train'], decor: 'cactus', yAmp: 1 }),
  T('turnpike',"Toad's Turnpike", 'flower', 'long', 16, 16, TH.highway, { wall: true, hazards: ['car'], decor: 'lamp', yAmp: 1.5 }),
  T('frappe',  'Frappe Snowland', 'flower', 'zigzag', 15, 14, TH.snow, { hazards: ['snowman'], decor: 'pine', yAmp: 2.5 }),
  T('choco',   'Choco Mountain', 'flower', 'hairpin', 14, 12, TH.choco, { wall: true, hazards: ['boulder'], decor: 'rock', yAmp: 6, yFreq: 2 }),
  T('mario',   'Mario Raceway', 'flower', 'peanut', 13.5, 14, TH.raceway, { hazards: ['piranha'], decor: 'pipe', yAmp: 2 }),
  T('wario',   'Wario Stadium', 'star', 'zigzag', 17, 16, TH.dirt, { wall: true, decor: 'tire', yAmp: 4, yFreq: 2, boostPads: [0.2, 0.5, 0.8] }),
  T('sherbet', 'Sherbet Land', 'star', 'kidney', 14, 13, TH.ice, { fall: true, hazards: ['penguin'], decor: 'pine', yAmp: 1 }),
  T('royal',   'Royal Raceway', 'star', 'long', 16, 14, TH.castle, { hazards: [], decor: 'tree', yAmp: 3, boostPads: [0.45, 0.75] }),
  T('bowser',  "Bowser's Castle", 'star', 'square', 15, 13, TH.lava, { wall: true, fall: true, hazards: ['thwomp'], decor: 'rock', yAmp: 2 }),
  T('jungle',  "DK's Jungle Parkway", 'special', 'hairpin', 16, 13, TH.jungle, { fall: true, decor: 'palm', yAmp: 5, boostPads: [0.3, 0.65] }),
  T('yoshi',   'Yoshi Valley', 'special', 'zigzag', 13, 11, TH.valley, { fall: true, hazards: ['egg'], decor: 'tree', yAmp: 4, mystery: true }),
  T('banshee', 'Banshee Boardwalk', 'special', 'peanut', 15, 11, TH.ghost, { fall: true, hazards: ['boo'], decor: 'lamp', yAmp: 1.5 }),
  T('rainbow', 'Rainbow Road', 'special', 'long', 24, 13, TH.rainbow, { wall: true, fall: true, hazards: ['chomp'], decor: 'star', yAmp: 8, yFreq: 2 }),
];
export const ARENAS = [
  { id: 'donut', name: 'Big Donut', kind: 'donut', sky: 0x2a1428, ground: 0x6a6a74, size: 90 },
  { id: 'fort', name: 'Block Fort', kind: 'fort', sky: 0x7ec8ff, ground: 0x9a9aa2, size: 110 },
  { id: 'deck', name: 'Double Deck', kind: 'deck', sky: 0x86c9ff, ground: 0x7a7a84, size: 100 },
  { id: 'scraper', name: 'Skyscraper', kind: 'scraper', sky: 0xff9d5c, ground: 0x8a8a94, size: 80 },
];
export function trackById(id) { return TRACKS.find(t => t.id === id) || TRACKS[0]; }
export function cupTracks(cupId) { return TRACKS.filter(t => t.cup === cupId); }
