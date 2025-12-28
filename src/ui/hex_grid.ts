import { hexToPixel, parseHexCubeKey } from '../lib/hexlib';
import type { HexCubeCoord, HexCubeKey, Layout } from '../lib/hexlib';
import { trunc_n } from '../lib/utils';

export interface HexState {
    value: string | number;
    tags: Set<string>;
    data?: any;
}

export interface HexCellStyle {
    className?: string;
    backgroundColor?: string;
    color?: string;
    text?: string;
}

export interface HexRenderOptions {
    styleFn?: (state: HexState, key: HexCubeKey) => HexCellStyle;
}

export class HexGrid {
    private container: HTMLElement;
    private layout: Layout;
    private cellCache: Map<string, HTMLElement> = new Map();
    
    public onCellClick: ((hex: HexCubeCoord) => void) | null = null;
    public onCellMouseDown: ((hex: HexCubeCoord) => void) | null = null;
    public onCellMouseEnter: ((hex: HexCubeCoord) => void) | null = null;
    public onCellHover: ((hex: HexCubeCoord) => void) | null = null;
    public onCellRightClick: ((hex: HexCubeCoord) => void) | null = null;

    constructor(container: HTMLElement, layout: Layout) {
        this.container = container;
        this.layout = layout;
        
        // Base styling for container to ensure absolute positioning works for children
        this.container.style.position = 'relative'; 
        // Note: We allow the container to be sized externally.
        // The children are absolute positioned based on layout.origin.
        // Let the caller position the container (e.g. left: 50%, top: 50%)
    }

    public updateLayout(layout: Layout) {
        this.layout = layout;
    }

    public render(map: Map<HexCubeKey, HexState>, options: HexRenderOptions = {}) {
        // console.log(`HexGrid: Rendering ${map.size} items`);
        
        const currentKeys = new Set<string>();

        for (const [key, state] of map.entries()) {
            if (typeof key !== 'string') {
                console.error("Invalid key type:", typeof key, key);
                continue;
            }
            
            currentKeys.add(key);
            let el = this.cellCache.get(key);
            let inner: HTMLElement;

            // Create if not exists
            if (!el) {
                const h = parseHexCubeKey(key);
                const pixel = hexToPixel(h, this.layout);

                el = document.createElement('div');
                el.className = 'hex';
                el.style.left = `${pixel.x}px`;
                el.style.top = `${pixel.y}px`;

                inner = document.createElement('div');
                inner.className = 'hex-inner';
                el.appendChild(inner);

                // Attach listeners once
                el.addEventListener('click', () => {
                    if (this.onCellClick) this.onCellClick(h);
                });

                el.addEventListener('mousedown', (e) => {
                    if (e.buttons === 1 && this.onCellMouseDown) {
                        this.onCellMouseDown(h);
                    }
                });

                el.addEventListener('mouseenter', (e) => {
                     // Check if left mouse button is held down
                    if (e.buttons === 1 && this.onCellMouseEnter) {
                        this.onCellMouseEnter(h);
                    }
                    if (this.onCellHover) {
                        this.onCellHover(h);
                    }
                });
                
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (this.onCellRightClick) this.onCellRightClick(h);
                });

                this.container.appendChild(el);
                this.cellCache.set(key, el);
            } else {
                inner = el.firstElementChild as HTMLElement;
            }

            // Always update position (in case layout changed)
            const h = parseHexCubeKey(key);
            const pixel = hexToPixel(h, this.layout);
            el.style.left = `${pixel.x}px`;
            el.style.top = `${pixel.y}px`;

            // Update Content
            if (state.value) {
                let displayText = trunc_n(state.value, 5);
                if (inner.innerText !== displayText) inner.innerText = displayText;
            } else {
                if (inner.innerText !== '') inner.innerText = '';
            }

            // Apply custom styles
            if (options.styleFn) {
                const style = options.styleFn(state, key);
                
                // Reset to base
                el.className = 'hex';
                if (style.className) el.classList.add(style.className);

                if (style.backgroundColor) inner.style.backgroundColor = style.backgroundColor;
                else inner.style.removeProperty('background-color');

                if (style.color) inner.style.color = style.color;
                else inner.style.removeProperty('color');

                if (style.text !== undefined) inner.innerText = style.text;
            }
        }

        // Cleanup removed cells
        for (const key of this.cellCache.keys()) {
            if (!currentKeys.has(key)) {
                const el = this.cellCache.get(key);
                if (el) el.remove();
                this.cellCache.delete(key);
            }
        }
    }
}
