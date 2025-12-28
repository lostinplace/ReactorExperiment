import { ThermoGame } from './game';
import type { HexCubeKey } from '../lib/hexlib';
import type { HexState, HexCellStyle } from '../ui/hex_grid';
import type { ShieldEntity } from './hex_tick';


export function mapThermoToHexGrid(game: ThermoGame): Map<HexCubeKey, HexState> {
    const map = new Map<HexCubeKey, HexState>();

    for (const [key, val] of game.state.E.entries()) {
        const ent = game.state.entities.get(key);
        const tags = new Set<string>();
        
        let displayValue: string | number = val;

        if (ent) {
            tags.add(ent.type);
            if (ent.destroyed) tags.add('destroyed');

            // check to see if it's a shield type, if so we get the disabled state from the simulation state
            if (ent.type === 'shield') {
                let entAsShield = ent as ShieldEntity;
                let entGroupId: number = entAsShield.groupId || 0;
                if (game.state.disabledShieldGroups.has(entGroupId)) tags.add('disabled');
            }
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
        if (state.tags.has('active')) style.text = '🔆' + ((state.data?.ent?.groupId || 0) > 0 ? state.data?.ent?.groupId : '');
        else style.text = '⭕';
    } else if (state.tags.has('sink')) {
        if (state.tags.has('destroyed')) {
            style.className = 'sink-cell-destroyed';
            style.text = '💥'; 
            style.color = 'white'; // Assuming destroyed sinks should still have white text
        } else {
            style.className = 'sink-cell';
            style.color = 'white';
            style.text = '🕳️' + ((state.data?.ent?.groupId || 0) > 0 ? state.data?.ent?.groupId : '');
        }
    } else if (state.tags.has('shield')) {
        if (state.tags.has('destroyed')) {
            style.className = 'shield-cell-destroyed';
            style.text = '🕸';
            style.color = '#a55';
        } else if (state.tags.has('disabled')) {
            style.className = 'disabled-shield-cell';
            style.color = 'gray';
        }
        else {
            style.className = 'shield-cell';
            style.color = 'black';
        }
        style.text = '⛊' + ((state.data?.ent?.groupId || 0) > 0 ? state.data?.ent?.groupId : '');
    } else if (state.tags.has('probe')) {
        if (state.tags.has('destroyed')) {
            style.className = 'probe-cell-destroyed';
            style.text = '☠️';
            style.color = '#555'; // Dark gray text
        } else {
            style.className = 'probe-cell';
            style.text = '⚡' + ((state.data?.ent?.groupId || 0) > 0 ? state.data?.ent?.groupId : '');
        }
    } else {
        style.className = 'monitor-cell';
        style.color = getHeatContrastColor(temp);
    }

    return style;
}

function getHeatColor(t: number): string {
    // Simple 0..100 scale? 
    // Let's assume range 0..500 or so.
    // 0 = Cold (Blue/Grey), 200 = Hot (Red)
    const maxT = 1450;
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

// Returns 'black' or 'white' depending on which contrasts better with the heat color at temp t.
export function getHeatContrastColor(t: number): string {
    const maxT = 1450;
    const n = Math.min(Math.max(t / maxT, 0), 1);
    
    // Same HSL logic as getHeatColor
    // Hue: (1 - n) * 240
    // S: 70%
    // L: 60%
    const h = (1 - n) * 240;
    const s = 0.7;
    const l = 0.6;
    
    const [r, g, b] = hslToRgb(h / 360, s, l);
    
    // Perceived luminance (standard Rec. 601)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Threshold usually 0.5, but can be tuned.
    // L is 0.6, so background is fairly light generally? 
    // If background is light, we want black text.
    // Let's check ranges. 
    // At L=0.6, it's mostly past the midpoint.
    // However, deep blue (hue 240) vs red (hue 0).
    // Blue luminance: 0.114*B roughly.
    // Red luminance: 0.299*R roughly.
    // Yellow/Green are brightest.
    // Let's rely on calculated luminance.
    
    // If luminance > 0.5, returns black (text), else white.
    return luminance > 0.5 ? 'black' : 'white';
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b];
}
