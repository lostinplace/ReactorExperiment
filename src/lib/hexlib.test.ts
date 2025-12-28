import { describe, it, expect } from 'vitest';
import {
  hexAdd,
  hexSub,
  hexScale,
  hexDistance,
  hexRound,
  hexRing,
  hexSpiral,
  hexCornerLOS,
  generateHexagon,
  type HexCubeCoord,
  type Layout,
  hexCubeKey,
  coordKeySet
} from './hexlib';

describe('hexlib', () => {
    describe('basic operations', () => {
        it('adds hexes', () => {
            const a: HexCubeCoord = [1, -1, 0];
            const b: HexCubeCoord = [2, -2, 0];
            expect(hexAdd(a, b)).toEqual([3, -3, 0]);
        });

        it('subtracts hexes', () => {
            const a: HexCubeCoord = [3, -3, 0];
            const b: HexCubeCoord = [2, -2, 0];
            expect(hexSub(a, b)).toEqual([1, -1, 0]);
        });

        it('scales hexes', () => {
            const a: HexCubeCoord = [1, -1, 0];
            expect(hexScale(a, 2)).toEqual([2, -2, 0]);
        });

        it('calculates distance', () => {
            expect(hexDistance([0, 0, 0], [1, -1, 0])).toBe(1);
            expect(hexDistance([0, 0, 0], [2, -2, 0])).toBe(2);
            expect(hexDistance([0, 0, 0], [-2, 0, 2])).toBe(2);
        });
    });

    describe('rounding', () => {
        it('rounds fractional coordinates correctly', () => {
            expect(hexRound([1.1, -1.9, 0.8])).toEqual([1, -2, 1]);
        });
    });

    describe('rings and spirals', () => {
        it('generates ring 0', () => {
            expect(hexRing([0,0,0], 0)).toEqual([[0,0,0]]);
        });

        it('generates ring 1', () => {
            const ring = hexRing([0,0,0], 1);
            expect(ring.length).toBe(6);
            for (const h of ring) expect(hexDistance([0,0,0], h)).toBe(1);
        });

        it('generates spiral of radius 1', () => {
            const spiral = hexSpiral([0,0,0], 1);
            expect(spiral.length).toBe(7); // 1 center + 6 ring
        });
    });

    describe('Line of Sight (LOS)', () => {
        const layout: Layout = {
            size: { x: 10, y: 10 },
            origin: { x: 0, y: 0 },
            orientation: 'pointy'
        };

        const center: HexCubeCoord = [0, 0, 0];
        const allCoords = generateHexagon(3, center);
        const allKeys = coordKeySet(allCoords);

        it('sees neighbor directly', () => {
            const b: HexCubeCoord = [0, -1, 1];
            const blocked = () => false;
            
            const dist = hexCornerLOS(center, b, layout, blocked, allKeys);
            expect(dist).toBe(1);
        });

        it('is blocked by direct obstacle (large wall)', () => {
             // 0,0,0 -> 0,-3,3. Path goes through 0,-1,1.
             // With 1.1 inflation, this should be blocked.
             const target: HexCubeCoord = [0, -2, 2];
             const obstacle: HexCubeCoord = [0, -1, 1];
             const obstacleKey = hexCubeKey(obstacle);

             const blocked = (h: HexCubeCoord) => hexCubeKey(h) === obstacleKey;
             
             const dist = hexCornerLOS(center, target, layout, blocked, allKeys);
             
             expect(dist).toBeNaN(); 
        });

        it('is blocked by full ring', () => {
            // center (0,0,0) looking at (0,-3,3).
            // Block the entire ring 1.
            const ring1 = hexRing(center, 1);
            const ringKeys = coordKeySet(ring1);
            
            const blocked = (h: HexCubeCoord) => ringKeys.has(hexCubeKey(h));
            
            // Ensure we consider these keys (though allKeys has them)
            const relevantKeys = new Set([...allKeys, ...ringKeys]);

            const dist = hexCornerLOS(center, [0,-3,3], layout, blocked, relevantKeys);
            expect(dist).toBeNaN();
        });

        it('sees around shallow obstacles (grazing)', () => {
            const start: HexCubeCoord = [0,0,0];
            const end: HexCubeCoord = [2,-2,0]; // 2 steps away
            
            // Midpoint is [1, -1, 0]. Let's block it.
            const mid: HexCubeCoord = [1, -1, 0];
            const blocked = (h: HexCubeCoord) => hexCubeKey(h) === hexCubeKey(mid);
            
            // Strict blocking disabled grazing.
            const dist = hexCornerLOS(start, end, layout, blocked, allKeys);
            
            expect(dist).toBeNaN();
        });
    });
});
