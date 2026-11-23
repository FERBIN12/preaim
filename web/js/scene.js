// Scene geometry in a fixed virtual world (1600x900). Pure data, no DOM.
export const WORLD = Object.freeze({ w: 1600, h: 900, wallTop: 180, floorY: 640 });

// Base enemy dimensions at scale 1.
export const ENEMY = Object.freeze({ headR: 22, shoulderHalf: 42, torso: 150 });

export const COVER = Object.freeze({
  door1: { x0: 230, x1: 400, top: 250 },
  crate: { x0: 690, x1: 900, top: 300, mid: 470, topX0: 710, topX1: 880 },
  door2: { x0: 1150, x1: 1290, top: 290 },
  pillar: { x0: 1400, x1: 1500, top: 120 },
});

// Each edge: x = cover edge, dir = direction the enemy steps out (+1 right, -1 left),
// clip = visible window [x0, x1, y0, y1] the enemy can be seen in.
const F = WORLD.floorY;
export const EDGES = Object.freeze([
  { id: 'door1-L', label: 'LEFT DOOR', x: 230, dir: +1, headY: 372, scale: 1.0, clip: [230, 400, 250, F] },
  { id: 'door1-R', label: 'LEFT DOOR', x: 400, dir: -1, headY: 372, scale: 1.0, clip: [230, 400, 250, F] },
  { id: 'crate-L', label: 'CRATES', x: 690, dir: -1, headY: 362, scale: 1.05, clip: [470, 690, WORLD.wallTop, F] },
  { id: 'crate-R', label: 'CRATES', x: 900, dir: +1, headY: 362, scale: 1.05, clip: [900, 1120, WORLD.wallTop, F] },
  { id: 'door2-L', label: 'FAR DOOR', x: 1150, dir: +1, headY: 398, scale: 0.8, clip: [1150, 1290, 290, F] },
  { id: 'door2-R', label: 'FAR DOOR', x: 1290, dir: -1, headY: 398, scale: 0.8, clip: [1150, 1290, 290, F] },
  { id: 'pillar', label: 'PILLAR', x: 1400, dir: -1, headY: 350, scale: 1.15, clip: [1200, 1400, WORLD.wallTop, WORLD.h] },
].map(Object.freeze));

/** The point a perfectly pre-aimed crosshair sits on: where the head first becomes visible. */
export function headAnchor(edge) {
  return { x: edge.x, y: edge.headY };
}
