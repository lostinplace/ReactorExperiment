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

export type Cube = readonly [number, number, number];
export type Axial = readonly [number, number]; // optional interoperability
export type CubeKey = string;

export const EPS = 1e-9;

// -----------------------------
// Keys / parsing
// -----------------------------
export const cubeKey = (c: Cube): CubeKey => `${c[0]},${c[1]},${c[2]}`;
export const parseCubeKey = (k: CubeKey): Cube => {
  const parts = k.split(",");
  if (parts.length !== 3) throw new Error(`Invalid CubeKey: "${k}"`);
  const x = Number(parts[0]), y = Number(parts[1]), z = Number(parts[2]);
  return [x, y, z] as const;
};

// -----------------------------
// Validation / basic ops
// -----------------------------
export const isValidCube = (c: Cube): boolean => c[0] + c[1] + c[2] === 0;

export const assertValidCube = (c: Cube, label = "cube"): void => {
  if (!isValidCube(c)) throw new Error(`Invalid ${label} coord: (${c.join(",")}) (x+y+z must equal 0)`);
};

export const cubeAdd = (a: Cube, b: Cube): Cube => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as const;
export const cubeSub = (a: Cube, b: Cube): Cube => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
export const cubeScale = (a: Cube, k: number): Cube => [a[0] * k, a[1] * k, a[2] * k] as const;

export const cubeEq = (a: Cube, b: Cube): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const cubeLength = (c: Cube): number =>
  (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2])) / 2;

// Canonical distance formula
export const cubeDistance = (a: Cube, b: Cube): number => cubeLength(cubeSub(a, b));

// A common equivalent (also valid for cube coords):
export const cubeRadius = (c: Cube): number => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2]));

// -----------------------------
// Directions / neighbors
// -----------------------------
export const CUBE_DIRS: readonly Cube[] = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
] as const;

export const cubeDir = (dirIndex: number): Cube => {
  const i = ((dirIndex % 6) + 6) % 6;
  return CUBE_DIRS[i];
};

export const cubeNeighbor = (c: Cube, dirIndex: number): Cube => cubeAdd(c, cubeDir(dirIndex));
export const cubeNeighbors = (c: Cube): Cube[] => CUBE_DIRS.map(d => cubeAdd(c, d));

// -----------------------------
// Axial interoperability
// -----------------------------
export const axialToCube = (a: Axial): Cube => {
  const q = a[0], r = a[1];
  const x = q;
  const z = r;
  const y = -x - z;
  return [x, y, z] as const;
};

export const cubeToAxial = (c: Cube): Axial => [c[0], c[2]] as const;

// -----------------------------
// Ranges / rings / spirals
// -----------------------------

/**
 * All cubes within distance <= R of center (a filled hex).
 * Count = 1 + 3R(R+1)
 */
export const cubeRange = (center: Cube, R: number): Cube[] => {
  const out: Cube[] = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = Math.max(-R, -dx - R); dy <= Math.min(R, -dx + R); dy++) {
      const dz = -dx - dy;
      out.push(cubeAdd(center, [dx, dy, dz] as const));
    }
  }
  return out;
};

/**
 * Exactly distance == R from center (a ring). Returns cells in a clockwise loop.
 */
export const cubeRing = (center: Cube, R: number): Cube[] => {
  if (R < 0) return [];
  if (R === 0) return [center];

  // Start at "direction 4" (arbitrary) scaled by R, then walk 6 sides
  let cube = cubeAdd(center, cubeScale(cubeDir(4), R));
  const results: Cube[] = [];

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < R; step++) {
      results.push(cube);
      cube = cubeNeighbor(cube, side);
    }
  }
  return results;
};

/**
 * Spiral out from center up to radius R, in ring order.
 */
export const cubeSpiral = (center: Cube, R: number): Cube[] => {
  const out: Cube[] = [center];
  for (let r = 1; r <= R; r++) out.push(...cubeRing(center, r));
  return out;
};

// -----------------------------
// Lines (lerp + rounding)
// -----------------------------

type CubeFrac = readonly [number, number, number];

const cubeLerp = (a: CubeFrac, b: CubeFrac, t: number): CubeFrac => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
] as const;

/**
 * Round fractional cube coordinates to the nearest valid cube coord.
 */
export const cubeRound = (f: CubeFrac): Cube => {
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
export const cubeLine = (a: Cube, b: Cube): Cube[] => {
  const N = cubeDistance(a, b);
  if (N === 0) return [a];

  // Nudge to avoid edge-case rounding ties
  const aF: CubeFrac = [a[0] + EPS, a[1] + EPS, a[2] - 2 * EPS] as const;
  const bF: CubeFrac = [b[0] + EPS, b[1] + EPS, b[2] - 2 * EPS] as const;

  const out: Cube[] = [];
  for (let i = 0; i <= N; i++) {
    out.push(cubeRound(cubeLerp(aF, bF, i / N)));
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
export const cubeRotateCW = (c: Cube, steps: number): Cube => {
  let s = ((steps % 6) + 6) % 6;
  let [x, y, z] = c;
  while (s-- > 0) {
    // 60° CW: (x,y,z) -> (-z, -x, -y)
    [x, y, z] = [-z, -x, -y];
  }
  return [x, y, z] as const;
};

export const cubeRotateCCW = (c: Cube, steps: number): Cube => cubeRotateCW(c, -steps);

export const cubeRotateAround = (c: Cube, center: Cube, stepsCW: number): Cube =>
  cubeAdd(center, cubeRotateCW(cubeSub(c, center), stepsCW));

/**
 * Reflect across a chosen axis in cube space.
 * axis = "x" | "y" | "z"
 */
export const cubeReflect = (c: Cube, axis: "x" | "y" | "z"): Cube => {
  const [x, y, z] = c;
  switch (axis) {
    case "x": return [x, z, y] as const;
    case "y": return [z, y, x] as const;
    case "z": return [y, x, z] as const;
  }
};

export const cubeReflectAround = (c: Cube, center: Cube, axis: "x" | "y" | "z"): Cube =>
  cubeAdd(center, cubeReflect(cubeSub(c, center), axis));

// -----------------------------
// Board generation (hexagon)
// -----------------------------

/**
 * Generate coords for a perfect hexagon board of radius R centered at `center`.
 * Cells satisfy max(|dx|,|dy|,|dz|) <= R relative to center.
 */
export const generateHexagon = (R: number, center: Cube = [0, 0, 0]): Cube[] => cubeRange(center, R);

/**
 * Edge test for a perfect hexagon of radius R around `center`.
 */
export const isHexagonEdge = (c: Cube, R: number, center: Cube = [0, 0, 0]): boolean => {
  const rel = cubeSub(c, center);
  return cubeRadius(rel) === R;
};

/**
 * Convenience: build a Set of keys for O(1) membership checks.
 */
export const coordKeySet = (coords: Iterable<Cube>): Set<CubeKey> => {
  const s = new Set<CubeKey>();
  for (const c of coords) s.add(cubeKey(c));
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
export const cubeToPixel = (c: Cube, layout: Layout): Point => {
  const [q, r] = cubeToAxial(c); // q = x, r = z
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
export const pixelToCube = (p: Point, layout: Layout): Cube => {
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
  const frac: CubeFrac = [q, -q - r, r] as const;
  return cubeRound(frac);
};

// -----------------------------
// Useful small helpers
// -----------------------------
export const cubeClampRadius = (c: Cube, maxR: number): Cube => {
  // Not a "normalize"; just a utility: if already within radius, return it,
  // otherwise move it toward origin along the line to origin until within maxR.
  const r = cubeRadius(c);
  if (r <= maxR) return c;
  // Move along line from origin to c, and pick point at distance maxR
  const line = cubeLine([0, 0, 0], c);
  return line[maxR] ?? line[line.length - 1];
};

/**
 * Iterate all coords that are inside `coordsSet` but also within radius R of center.
 * Handy for custom shapes where you want local neighborhoods clipped by the board.
 */
export const clippedRange = (center: Cube, R: number, coordsSet: Set<CubeKey>): Cube[] => {
  const out: Cube[] = [];
  for (const c of cubeRange(center, R)) {
    if (coordsSet.has(cubeKey(c))) out.push(c);
  }
  return out;
};
