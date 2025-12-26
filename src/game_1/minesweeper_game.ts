import { cubeKey, cubeNeighbors, cubeRange, parseCubeKey, cubeEq } from '../lib/hexlib.ts';
import type { Cube, CubeKey } from '../lib/hexlib.ts';
import { RNG } from '../lib/rng.ts';
import GameConfig from './config.ts';
import { RunState } from './run_state.ts';

export const GameState = {
    PLAYING: 0,
    WON: 1,
    LOST: 2,
    LOCKED: 3
} as const;

export type GameState = typeof GameState[keyof typeof GameState];

class MinesweeperGame {
    public mines: Map<CubeKey, number> = new Map();
    public revealed: Set<CubeKey> = new Set();
    public flagged: Set<CubeKey> = new Set();
    public state: GameState = GameState.PLAYING;
    public config: GameConfig;
    public runState: RunState;
    private rng: RNG;

    public onMineRevealed: ((h: Cube) => void) | null = null;
    public onGameStart: (() => void) | null = null;

    constructor(config: GameConfig) {
        this.config = config;
        this.runState = new RunState();
        this.rng = new RNG(config.seed);
    }

    public lockGame() {
        if (this.state === GameState.PLAYING) {
            this.state = GameState.LOCKED;
        }
    }

    private generateMines(safeHex: Cube) {
        const center: Cube = [0, 0, 0];
        const allHexes = cubeRange(center, this.config.mapRadius).filter(h => !cubeEq(h, safeHex));

        // Shuffle and pick mines
        for (let i = allHexes.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [allHexes[i], allHexes[j]] = [allHexes[j], allHexes[i]];
        }

        for (let i = 0; i < this.config.mineCount && i < allHexes.length; i++) {
            // Random value between 0.5 and 1.9
            const mineValue = this.rng.nextRange(0.5, 1.9);
            this.mines.set(cubeKey(allHexes[i]), mineValue);
        }
    }

    public reveal(h: Cube) {
        if (this.state !== GameState.PLAYING) return;
        const key = cubeKey(h);
        if (this.flagged.has(key) || this.revealed.has(key)) return;

        // First click generation
        if (this.revealed.size === 0 && this.mines.size === 0) {
            this.generateMines(h);
            this.runState.start();
            if (this.onGameStart) this.onGameStart();
        }

        this.revealed.add(key);

        if (this.mines.has(key)) {
            // Reset radius 6
            this.resetRadius(h, 6);
            if (this.onMineRevealed) this.onMineRevealed(h);
            return;
        }

        const neighborMines = this.countNeighborMines(h);
        if (neighborMines === 0) {
            // Flood fill
            // Neighbors are 6 directions
            for (const neighbor of cubeNeighbors(h)) {
                if (this.isValidHex(neighbor)) {
                    this.reveal(neighbor);
                }
            }
        }

        // Check win removed from reveal, as it depends on flags now
        // this.checkWin();
    }

    private resetRadius(center: Cube, radius: number) {
        const targets = cubeRange(center, radius);
        
        for (const target of targets) {
            if (this.isValidHex(target)) {
                const key = cubeKey(target);
                if (this.flagged.has(key)) {
                    this.flagged.delete(key);
                    this.runState.removeFlag(key);
                }
                this.revealed.delete(key);
            }
        }
    }

    public onFlagStateChange: ((hex: Cube, isFlagged: boolean) => void) | null = null;

    public toggleFlag(h: Cube) {
        if (this.state !== GameState.PLAYING || this.revealed.has(cubeKey(h))) return;
        const key = cubeKey(h);
        const isFlagged = this.flagged.has(key);
        
        if (isFlagged) {
            this.flagged.delete(key);
            this.runState.removeFlag(key);
        } else {
            this.flagged.add(key);
            this.runState.addFlag(key);
        }
        
        if (this.onFlagStateChange) {
            this.onFlagStateChange(h, isFlagged);
        }
        
        this.checkWin();
    }

    public countNeighborMines(h: Cube): number {
        let count = 0;
        for (const neighbor of cubeNeighbors(h)) {
            const val = this.mines.get(cubeKey(neighbor));
            if (val !== undefined) {
                count += val;
            }
        }
        return count;
    }

    private isValidHex(h: Cube): boolean {
        // Simple radius check from origin
        return Math.max(Math.abs(h[0]), Math.abs(h[1]), Math.abs(h[2])) <= this.config.mapRadius;
    }

    public calculateStats() {
        if (!this.runState.startTime) return null;
        
        let timeSeconds: number;
        if (this.state === GameState.LOCKED) {
             const lastFlagTime = this.runState.getLastFlagTime();
             if (lastFlagTime && lastFlagTime >= this.runState.startTime) {
                 timeSeconds = (lastFlagTime - this.runState.startTime) / 1000;
             } else {
                 timeSeconds = (Date.now() - this.runState.startTime) / 1000;
             }
        } else {
             timeSeconds = (Date.now() - this.runState.startTime) / 1000;
        }
        
        if (this.state === GameState.LOCKED) {
             const lastFlagTime = this.runState.getLastFlagTime();
             if (lastFlagTime) {
                 timeSeconds = (lastFlagTime - this.runState.startTime) / 1000;
             }
        }

        const timeMinutes = Math.max(timeSeconds / 60, 0.001); // Avoid div by zero

        let correctMinesSum = 0;
        let correctFlagsCount = 0;
        let incorrectFlagsCount = 0;

        for (const flagKey of this.flagged) {
             if (this.mines.has(flagKey)) {
                 correctFlagsCount++;
                 correctMinesSum += (this.mines.get(flagKey) || 0);
             } else {
                 incorrectFlagsCount++;
             }
        }

        const currentExponent = 1.0 + (((correctFlagsCount - incorrectFlagsCount) / this.config.mineCount) * this.config.exponentBase);
        
        const rawPower = Math.pow(correctMinesSum, currentExponent - (incorrectFlagsCount * 0.1));
        const powerPerMin = rawPower / timeMinutes;
        
        let heatSum = 0;
        for (const revealedKey of this.revealed) {
            const h = parseCubeKey(revealedKey);
            
            if (!this.mines.has(revealedKey)) {
                heatSum += this.countNeighborMines(h);
            }
        }
        
        const heatPerMin = heatSum / timeMinutes;

        return {
            rawPower: Math.max(0, rawPower),
            powerPerMin: Math.max(0, powerPerMin),
            rawHeat: heatSum,
            heatPerMin: heatPerMin,
            currentExponent,
            timeSeconds
        };

    }

    private checkWin() {
        let correctFlags = 0;
        let incorrectFlags = 0;
        
        for (const flagKey of this.flagged) {
             if (this.mines.has(flagKey)) {
                 correctFlags++;
             } else {
                 incorrectFlags++;
             }
        }
        
        if (correctFlags === this.mines.size && incorrectFlags === 0) {
            this.state = GameState.WON;
        }
    }
}

export default MinesweeperGame
