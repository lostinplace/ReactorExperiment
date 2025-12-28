/**
 * hexlib.ts — A single-file, dependency-free utility library for hex grids using CUBE coordinates.
 *
 * Coordinate system:
 *   - Cube coords are (x, y, z) with invariant x + y + z = 0.
 *   - Rendering orientation (pointy-top / flat-top) does NOT affect these mechanics.
 *
 * What you get:
 *   - Cube coord helpers (neighbors, distance, rings, spirals, lines, range)
 *   - Board generation (hexagon radius R)
 *   - Edge detection
 *   - Pixel conversion (pointy-top or flat-top) + inverse (pixel → hex) with proper rounding
 *   - Rotation/reflection around origin or around any center
 *
 * Notes:
 *   - For hashing keys in Maps/Sets, use cubeKey().
 *   - All functions are pure and do not mutate inputs.
 */

export type HexCubeCoord = readonly [number, number, number];
export type Axial = readonly [number, number]; // optional interoperability
export type HexCubeKey = string;

export const EPS = 1e-9;

// -----------------------------
// Keys / parsing
// -----------------------------
export const hexCubeKey = (c: HexCubeCoord): HexCubeKey => `${c[0]},${c[1]},${c[2]}`;
export const parseHexCubeKey = (k: HexCubeKey): HexCubeCoord => {
  const parts = k.split(",");
  if (parts.length !== 3) throw new Error(`Invalid CubeKey: "${k}"`);
  const x = Number(parts[0]), y = Number(parts[1]), z = Number(parts[2]);
  return [x, y, z] as const;
};

// -----------------------------
// Validation / basic ops
// -----------------------------
export const isValidHexCubeKey = (c: HexCubeCoord): boolean => c[0] + c[1] + c[2] === 0;

export const hexAdd = (a: HexCubeCoord, b: HexCubeCoord): HexCubeCoord => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as const;
export const hexSub = (a: HexCubeCoord, b: HexCubeCoord): HexCubeCoord => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
export const hexScale = (a: HexCubeCoord, k: number): HexCubeCoord => [a[0] * k, a[1] * k, a[2] * k] as const;

export const hexEq = (a: HexCubeCoord, b: HexCubeCoord): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const hexLength = (c: HexCubeCoord): number =>
  (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2])) / 2;

// Canonical distance formula
export const hexDistance = (a: HexCubeCoord, b: HexCubeCoord): number => hexLength(hexSub(a, b));

// A common equivalent (also valid for cube coords):
export const hexRadius = (c: HexCubeCoord): number => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2]));

// -----------------------------
// Directions / neighbors
// -----------------------------
export const HEX_CUBE_DIRS: readonly HexCubeCoord[] = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
] as const;

export const hexDir = (dirIndex: number): HexCubeCoord => {
  const i = ((dirIndex % 6) + 6) % 6;
  return HEX_CUBE_DIRS[i];
};

export const hexNeighbor = (c: HexCubeCoord, dirIndex: number): HexCubeCoord => hexAdd(c, hexDir(dirIndex));
export const hexNeighbors = (c: HexCubeCoord): HexCubeCoord[] => HEX_CUBE_DIRS.map(d => hexAdd(c, d));


export const hexCubeToAxial = (c: HexCubeCoord): Axial => [c[0], c[2]] as const;

// -----------------------------
// Ranges / rings / spirals
// -----------------------------

/**
 * All cubes within distance <= R of center (a filled hex).
 * Count = 1 + 3R(R+1)
 */
export const hexRange = (center: HexCubeCoord, R: number): HexCubeCoord[] => {
  const out: HexCubeCoord[] = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = Math.max(-R, -dx - R); dy <= Math.min(R, -dx + R); dy++) {
      const dz = -dx - dy;
      out.push(hexAdd(center, [dx, dy, dz] as const));
    }
  }
  return out;
};

/**
 * Exactly distance == R from center (a ring). Returns cells in a clockwise loop.
 */
export const hexRing = (center: HexCubeCoord, R: number): HexCubeCoord[] => {
  if (R < 0) return [];
  if (R === 0) return [center];

  // Start at "direction 4" (arbitrary) scaled by R, then walk 6 sides
  let thisCell = hexAdd(center, hexScale(hexDir(4), R));
  const results: HexCubeCoord[] = [];

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < R; step++) {
      results.push(thisCell);
      thisCell = hexNeighbor(thisCell, side);
    }
  }
  return results;
};

/**
 * Spiral out from center up to radius R, in ring order.
 */
export const hexSpiral = (center: HexCubeCoord, R: number): HexCubeCoord[] => {
  const out: HexCubeCoord[] = [center];
  for (let r = 1; r <= R; r++) out.push(...hexRing(center, r));
  return out;
};

// -----------------------------
// Lines (lerp + rounding)
// -----------------------------

type HexFrac = readonly [number, number, number];

const hexLerp = (a: HexFrac, b: HexFrac, t: number): HexFrac => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
] as const;

/**
 * Round fractional cube coordinates to the nearest valid cube coord.
 */
export const hexRound = (f: HexFrac): HexCubeCoord => {
  let rx = Math.round(f[0]);
  let ry = Math.round(f[1]);
  let rz = Math.round(f[2]);

  const xDiff = Math.abs(rx - f[0]);
  const yDiff = Math.abs(ry - f[1]);
  const zDiff = Math.abs(rz - f[2]);

  // Enforce x+y+z=0 by fixing the component with the biggest rounding error
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return [rx, ry, rz] as const;
};

/**
 * Get the straight line (inclusive) between a and b on a hex grid.
 */
export const hexLine = (a: HexCubeCoord, b: HexCubeCoord): HexCubeCoord[] => {
  const N = hexDistance(a, b);
  if (N === 0) return [a];

  // Nudge to avoid edge-case rounding ties
  const aF: HexFrac = [a[0] + EPS, a[1] + EPS, a[2] - 2 * EPS] as const;
  const bF: HexFrac = [b[0] + EPS, b[1] + EPS, b[2] - 2 * EPS] as const;

  const out: HexCubeCoord[] = [];
  for (let i = 0; i <= N; i++) {
    out.push(hexRound(hexLerp(aF, bF, i / N)));
  }
  return out;
};

// -----------------------------
// Rotation / reflection
// -----------------------------

/**
 * Rotate around origin by 60° steps clockwise.
 * steps can be any integer (mod 6).
 */
export const hexRotateCW = (c: HexCubeCoord, steps: number): HexCubeCoord => {
  let s = ((steps % 6) + 6) % 6;
  let [x, y, z] = c;
  while (s-- > 0) {
    // 60° CW: (x,y,z) -> (-z, -x, -y)
    [x, y, z] = [-z, -x, -y];
  }
  return [x, y, z] as const;
};

export const hexRotateCCW = (c: HexCubeCoord, steps: number): HexCubeCoord => hexRotateCW(c, -steps);

export const hexRotateAround = (c: HexCubeCoord, center: HexCubeCoord, stepsCW: number): HexCubeCoord =>
  hexAdd(center, hexRotateCW(hexSub(c, center), stepsCW));

/**
 * Reflect across a chosen axis in cube space.
 * axis = "x" | "y" | "z"
 */
export const hexReflect = (c: HexCubeCoord, axis: "x" | "y" | "z"): HexCubeCoord => {
  const [x, y, z] = c;
  switch (axis) {
    case "x": return [x, z, y] as const;
    case "y": return [z, y, x] as const;
    case "z": return [y, x, z] as const;
  }
};

export const hexReflectAround = (c: HexCubeCoord, center: HexCubeCoord, axis: "x" | "y" | "z"): HexCubeCoord =>
  hexAdd(center, hexReflect(hexSub(c, center), axis));

// -----------------------------
// Board generation (hexagon)
// -----------------------------

/**
 * Generate coords for a perfect hexagon board of radius R centered at `center`.
 * Cells satisfy max(|dx|,|dy|,|dz|) <= R relative to center.
 */
export const generateHexagon = (R: number, center: HexCubeCoord = [0, 0, 0]): HexCubeCoord[] => hexRange(center, R);

/**
 * Edge test for a perfect hexagon of radius R around `center`.
 */
export const isHexagonEdge = (c: HexCubeCoord, R: number, center: HexCubeCoord = [0, 0, 0]): boolean => {
  const rel = hexSub(c, center);
  return hexRadius(rel) === R;
};

/**
 * Convenience: build a Set of keys for O(1) membership checks.
 */
export const coordKeySet = (coords: Iterable<HexCubeCoord>): Set<HexCubeKey> => {
  const s = new Set<HexCubeKey>();
  for (const c of coords) s.add(hexCubeKey(c));
  return s;
};

// -----------------------------
// Pixel conversion (optional but often needed)
// -----------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  /**
   * size.x = hex radius in pixels (width scale)
   * size.y = hex radius in pixels (height scale)
   */
  size: Point;
  /**
   * origin = pixel origin (center) for cube(0,0,0) in screen space
   */
  origin: Point;
  /**
   * orientation
   * - "pointy": pointy-top (point-end-north)
   * - "flat": flat-top
   */
  orientation: "pointy" | "flat";
}

/**
 * Convert cube -> pixel center position.
 * (Uses standard axial projection via cubeToAxial, then orientation matrices.)
 */
export const hexToPixel = (c: HexCubeCoord, layout: Layout): Point => {
  const [q, r] = hexCubeToAxial(c); // q = x, r = z
  const { size, origin, orientation } = layout;

  if (orientation === "pointy") {
    // pointy-top axial to pixel
    const x = size.x * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = size.y * ((3 / 2) * r);
    return { x: x + origin.x, y: y + origin.y };
  } else {
    // flat-top axial to pixel
    const x = size.x * ((3 / 2) * q);
    const y = size.y * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
    return { x: x + origin.x, y: y + origin.y };
  }
};

/**
 * Convert pixel -> nearest cube coord.
 */
export const pixelToHex = (p: Point, layout: Layout): HexCubeCoord => {
  const { size, origin, orientation } = layout;
  const px = (p.x - origin.x) / size.x;
  const py = (p.y - origin.y) / size.y;

  let q: number;
  let r: number;

  if (orientation === "pointy") {
    // Inverse of pointy-top axial to pixel
    q = (Math.sqrt(3) / 3) * px - (1 / 3) * py;
    r = (2 / 3) * py;
  } else {
    // Inverse of flat-top axial to pixel
    q = (2 / 3) * px;
    r = (-1 / 3) * px + (Math.sqrt(3) / 3) * py;
  }

  // axial (q,r) -> cube (x,y,z) then round
  const frac: HexFrac = [q, -q - r, r] as const;
  return hexRound(frac);
};

// -----------------------------
// Useful small helpers
// -----------------------------
export const hexClampRadius = (c: HexCubeCoord, maxR: number): HexCubeCoord => {
  // Not a "normalize"; just a utility: if already within radius, return it,
  // otherwise move it toward origin along the line to origin until within maxR.
  const r = hexRadius(c);
  if (r <= maxR) return c;
  // Move along line from origin to c, and pick point at distance maxR
  const line = hexLine([0, 0, 0], c);
  return line[maxR] ?? line[line.length - 1];
};

/**
 * Iterate all coords that are inside `coordsSet` but also within radius R of center.
 * Handy for custom shapes where you want local neighborhoods clipped by the board.
 */
export const clippedRange = (center: HexCubeCoord, R: number, coordsSet: Set<HexCubeKey>): HexCubeCoord[] => {
  const out: HexCubeCoord[] = [];
  for (const c of hexRange(center, R)) {
    if (coordsSet.has(hexCubeKey(c))) out.push(c);
  }
  return out;
};



function orient(a: Point, b: Point, c: Point): number {
  // cross((b-a),(c-a))
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS &&
    Math.abs(orient(a, b, p)) <= EPS
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  // general case
  if ((o1 > EPS && o2 < -EPS || o1 < -EPS && o2 > EPS) &&
      (o3 > EPS && o4 < -EPS || o3 < -EPS && o4 > EPS)) return true;

  // collinear / touching cases
  if (Math.abs(o1) <= EPS && onSegment(a, b, c)) return true;
  if (Math.abs(o2) <= EPS && onSegment(a, b, d)) return true;
  if (Math.abs(o3) <= EPS && onSegment(c, d, a)) return true;
  if (Math.abs(o4) <= EPS && onSegment(c, d, b)) return true;

  return false;
}

function pointInConvexPolygon(p: Point, poly: Point[]): boolean {
  // Works for convex polygons in CCW or CW order.
  // Treat boundary as inside (tweak if you want boundary to be non-blocking).
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const o = orient(a, b, p);
    if (Math.abs(o) <= EPS) continue;
    const s = o > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Returns true if segment AB intersects polygon interior (or boundary, depending on rules).
 * For LOS blocking, the simplest rule is: if segment intersects ANY edge OR passes through interior => blocked.
 */
function segmentIntersectsPolygon(a: Point, b: Point, poly: Point[]): boolean {
  // edge intersection
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const d = poly[(i + 1) % poly.length];
    if (segmentsIntersect(a, b, c, d)) return true;
  }
  // segment entirely inside polygon (no edge cross)
  // check midpoint
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (pointInConvexPolygon(mid, poly)) return true;

  return false;
}


function hexCorners(hex: HexCubeCoord, layout: Layout): Point[] {
  const center = hexToPixel(hex, layout);

  // These names depend on your layout shape.
  // Common: layout.size = { x: number, y: number }
  // Common: layout.orientation.startAngle = 0 (pointy) or 0.5 (flat)
  const sizeX = (layout as any).size?.x ?? (layout as any).size?.X;
  const sizeY = (layout as any).size?.y ?? (layout as any).size?.Y;
  const startAngle = (layout as any).orientation?.startAngle ?? 0; // best guess

  if (typeof sizeX !== "number" || typeof sizeY !== "number") {
    throw new Error("hexCorners: layout.size.x/y not found; use your hexlib corner helper instead.");
  }

  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = 2 * Math.PI * (startAngle + i) / 6;
    corners.push({
      x: center.x + sizeX * Math.cos(angle),
      y: center.y + sizeY * Math.sin(angle),
    });
  }
  return corners;
}

export function hexCornerLOS(
  a: HexCubeCoord,
  b: HexCubeCoord,
  layout: Layout,
  blocked: (h: HexCubeCoord) => boolean,
  allHexesToConsider: Iterable<HexCubeKey> // typically map.keys()
): number {
  const aCorners = hexCorners(a, layout);
  const bCorners = hexCorners(b, layout);

  // Precompute obstacle polygons
  const obstacles: Point[][] = [];
  for (const key of allHexesToConsider) {
    const h = parseHexCubeKey(key);
    // don’t treat endpoints as obstacles
    if (!blocked(h)) continue;

    // Inflate polygon slightly to prevent rays passing through shared edges/vertices
    // due to floating point epsilon (the "grazing leak").
    const rawCorners = hexCorners(h, layout);
    const center = hexToPixel(h, layout);
    const inflated = rawCorners.map(p => ({
        x: center.x + (p.x - center.x) * 1.1,
        y: center.y + (p.y - center.y) * 1.1
    }));
    obstacles.push(inflated);
  }

  // Try all 36 corner-to-corner segments
  for (const p of aCorners) {
    for (const q of bCorners) {
      let hit = false;
      for (const poly of obstacles) {
        if (segmentIntersectsPolygon(p, q, poly)) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        // Found an unobstructed segment
        return hexDistance(a, b);
      }
    }
  }

  return NaN;
}
