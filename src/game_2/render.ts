import { ThermoGame } from './game';
import type { CubeKey } from '../lib/hexlib';
import type { HexState, HexCellStyle } from '../ui/hex_grid';


export function mapThermoToHexGrid(game: ThermoGame): Map<CubeKey, HexState> {
    const map = new Map<CubeKey, HexState>();

    for (const [key, val] of game.E.entries()) {
        const ent = game.entities.get(key);
        const tags = new Set<string>();
        
        let displayValue: string | number = val;

        if (ent) {
            tags.add(ent.type);
            if (ent.type === 'source') {
                if (ent.active) tags.add('active');
                displayValue = 'S';
            } else if (ent.type === 'sink') {
                displayValue = 'X';
            } else if (ent.type === 'shield') {
                displayValue = '||';
            } else if (ent.type === 'probe') {
                 displayValue = val; // Show full value
            }
        }

        map.set(key, { value: displayValue, tags, data: { temp: val, ent } });
    }
    return map;
}

export function getThermoStyle(state: HexState): HexCellStyle {
    const temp = state.data?.temp || 0;
    const style: HexCellStyle = {};

    // Heatmap background
    style.backgroundColor = getHeatColor(temp);
    
    // Entity styles
    if (state.tags.has('source')) {
        style.className = 'source-cell';
        style.color = 'black';
        if (state.tags.has('active')) style.text = '🔆'+state.data?.ent?.groupId;
        else style.text = '⭕';
    } else if (state.tags.has('sink')) {
        style.className = 'sink-cell';
        style.color = 'white';
        style.text = '🕳️';
    } else if (state.tags.has('shield')) {
        style.className = 'shield-cell';
        style.color = 'black';
        style.text = '⛊'+state.data?.ent?.groupId;
    } else if (state.tags.has('probe')) {
        style.className = 'probe-cell';
        style.text = '🌡'+state.data?.ent?.groupId;
    }

    return style;
}

function getHeatColor(t: number): string {
    // Simple 0..100 scale? 
    // Let's assume range 0..500 or so.
    // 0 = Cold (Blue/Grey), 200 = Hot (Red)
    const maxT = 450;
    const n = Math.min(Math.max(t / maxT, 0), 1);
    
    // Lerp Blue -> Red
    // Blue: 200, 200, 255
    // Red: 255, 100, 100
    // White middle?
    
    // Turbo/Jet-ish or just HSL
    // 240 (blue) -> 0 (red)
    const hue = (1 - n) * 240;
    return `hsl(${hue}, 70%, 60%)`;
}
