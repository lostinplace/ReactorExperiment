export class RunState {
    public startTime: number | null = null;
    public flagEvents: Map<string, number> = new Map(); // hexKey -> timestamp

    reset() {
        this.startTime = null;
        this.flagEvents.clear();
    }

    start() {
        if (!this.startTime) {
            this.startTime = Date.now();
        }
    }

    addFlag(hexKey: string) {
        if (this.startTime) {
             this.flagEvents.set(hexKey, Date.now());
        }
    }

    removeFlag(hexKey: string) {
        this.flagEvents.delete(hexKey);
    }

    getFlagTime(hexKey: string): number | null {
        return this.flagEvents.get(hexKey) || null;
    }

    getLastFlagTime(): number | null {
        if (this.flagEvents.size === 0) return null;
        let maxTime = 0;
        for (const t of this.flagEvents.values()) {
            if (t > maxTime) maxTime = t;
        }
        return maxTime;
    }
}
