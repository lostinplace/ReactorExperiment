export class RNG {
    private seed: number;

    constructor(seed: number | string) {
        if (typeof seed === 'string') {
            this.seed = this.hashString(seed);
        } else {
            this.seed = seed;
        }
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    // Mulberry32
    public next(): number {
        this.seed |= 0;
        this.seed = this.seed + 0x6D2B79F5 | 0;
        let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    public nextRange(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
}
