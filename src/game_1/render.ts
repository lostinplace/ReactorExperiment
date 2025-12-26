import MinesweeperGame from './minesweeper_game.ts';
import { cubeRange, cubeKey } from '../lib/hexlib.ts';
import type { Cube, CubeKey } from '../lib/hexlib.ts';
import type { HexState } from '../ui/hex_grid.ts';

export function mapGameToHexGrid(game: MinesweeperGame): Map<CubeKey, HexState> {
    const { mapRadius } = game.config;
    const map = new Map<CubeKey, HexState>();
    const center: Cube = [0, 0, 0];
    
    // Iterate specific range instead of nested loops
    const hexes = cubeRange(center, mapRadius);

    for (const h of hexes) {
        const key = cubeKey(h);
        const tags = new Set<string>();
        let value: string | number = '';
        
        // Default state
        if (game.revealed.has(key)) {
            tags.add('revealed');
            
            if (game.mines.has(key)) {
                tags.add('mine');
                value = '💣';
            } else {
                const count = game.countNeighborMines(h);
                if (count > 0) {
                    value = count;
                    tags.add(`count-${Math.ceil(count)}`); // Helper tag for styling
                }
            }
        } else if (game.flagged.has(key)) {
            tags.add('flagged');
            value = '🚩'; // Or empty if we use CSS for flag icon
        } else {
            tags.add('hidden');
        }

        map.set(key, { value, tags });
    }
    return map;
}

export function getMinesweeperStyle(state: HexState) {
    const style: any = {};
    if (state.tags.has('revealed')) {
        style.className = 'revealed';
        if (state.tags.has('mine')) {
            style.className += ' mine';
        }
    } else if (state.tags.has('flagged')) {
        style.className = 'flagged';
    } else {
        style.className = 'hidden'; // Ensure hidden cells have a class if needed
    }
    
    // Number colors
    if (typeof state.value === 'number') {
         style.color = getNumberColor(state.value);
    }
    
    return style;
}

function getNumberColor(count: number): string {
    const colors = [
        '', 'blue', 'green', 'red', 'darkblue', 'brown', 'cyan', 'black', 'gray'
    ];
    return colors[count] || 'black';
}
