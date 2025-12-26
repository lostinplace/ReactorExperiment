import { cubeKey, parseCubeKey, generateHexagon, type Cube, type CubeKey } from '../lib/hexlib';
import {tickThermo, type HexMapE, type Sink, type Source, type Shield, type Probe, type TickResult } from './hex_tick';

export type EntityType = 'source' | 'sink' | 'shield' | 'probe' | 'empty';

export interface EntityCommon {
    type: EntityType;
    pos: Cube;
}

export interface SourceEntity extends EntityCommon {
    type: 'source';
    power: number;
    active: boolean;
    minActivation: number; // Placeholder for logic
    groupId: number; // 1-4
}

export interface SinkEntity extends EntityCommon {
    type: 'sink';
    stored: number;
    pullRate: number;
    dumpMax: number;
    capacityScale: number;
    conductivity: number;
}

export interface ShieldEntity extends EntityCommon {
    type: 'shield';
    conductivity: number;
    groupId: number; // 1-4
    savedTemp?: number;
}

export interface ProbeEntity extends EntityCommon {
    type: 'probe';
    groupId: number; // 1-4
}

export type Entity = SourceEntity | SinkEntity | ShieldEntity | ProbeEntity;

export class ThermoGame {
    public E: HexMapE = new Map();
    public entities: Map<CubeKey, Entity> = new Map();
    public tickCount: number = 0;
    
    // Config
    public diffusionAlpha: number = 0.1;
    public baseConductivity: number = 1.0;
    
    public groupThrottles: Map<number, number> = new Map();
    public disabledShieldGroups: Set<number> = new Set();
    
    public probeThrottles: Map<number, number> = new Map();
    public totalEnergyCollected: Map<number, number> = new Map();
    public lastTickEnergy: Map<number, number> = new Map();
    public radius: number = 8;

    constructor(initialKeys?: Iterable<CubeKey>, radius?: number) {
        if (radius) this.radius = radius;
        if (initialKeys) {
            for (const k of initialKeys) {
                this.E.set(k, 0);
            }
        }
        // Initialize default throttles
        [1, 2, 3, 4].forEach(id => {
            this.groupThrottles.set(id, 1.0);
            this.probeThrottles.set(id, 0.0); // Default OFF
            this.totalEnergyCollected.set(id, 0.0);
        });
    }

    public tick() {
        // Collect arrays for hex_tick
        const sources: Source[] = [];
        const shields: Shield[] = [];
        const sinks: Sink[] = [];
        const probes: Probe[] = [];

        for (const e of this.entities.values()) {
            if (e.type === 'source') {
                sources.push({ pos: e.pos, power: e.power, active: e.active, groupId: e.groupId });
            } else if (e.type === 'shield') {
                shields.push({ pos: e.pos, conductivity: e.conductivity, groupId: e.groupId });
            } else if (e.type === 'sink') {
                sinks.push({ 
                    pos: e.pos, 
                    stored: e.stored, 
                    pullRate: e.pullRate, 
                    dumpMax: e.dumpMax,
                    capacityScale: e.capacityScale,
                    conductivity: e.conductivity
                });
            } else if (e.type === 'probe') {
                probes.push({ pos: e.pos, groupId: e.groupId });
            }
        }

        const res: TickResult = tickThermo(
            this.E,
            sources,
            shields,
            sinks,
            probes,
            { 
                diffusionAlpha: this.diffusionAlpha, 
                baseConductivity: this.baseConductivity,
                throttles: this.groupThrottles,
                disabledShieldGroups: this.disabledShieldGroups,
                probeThrottles: this.probeThrottles
            }
        );

        this.E = res.E;
        this.tickCount++;

        // Sync back sink state
        for (const s of res.sinks) {
            const k = cubeKey(s.pos);
            const ent = this.entities.get(k);
            if (ent && ent.type === 'sink') {
                ent.stored = s.stored;
            }
        }
        
        // Accumulate collected energy
        for (const [groupId, amount] of res.energyCollected.entries()) {
            const current = this.totalEnergyCollected.get(groupId) || 0;
            this.totalEnergyCollected.set(groupId, current + amount);
        }
        
        // Store per-tick energy for UI
        this.lastTickEnergy = res.energyCollected;
    }

    public toggleShieldGroup(groupId: number) {
        if (this.disabledShieldGroups.has(groupId)) {
            // Enabling: Restore temp
            this.disabledShieldGroups.delete(groupId);
            for (const [k, e] of this.entities) {
                if (e.type === 'shield' && e.groupId === groupId) {
                    if (e.savedTemp !== undefined) {
                        this.E.set(k, e.savedTemp);
                        e.savedTemp = undefined;
                    }
                }
            }
        } else {
            // Disabling: Save temp
            this.disabledShieldGroups.add(groupId);
            for (const [k, e] of this.entities) {
                if (e.type === 'shield' && e.groupId === groupId) {
                    e.savedTemp = this.E.get(k) || 0;
                    // We leave the cell temp as-is, letting it diffuse away naturally
                }
            }
        }
    }

    public setEntity(key: CubeKey, type: EntityType) {
        const pos = parseCubeKey(key);
        if (type === 'empty') {
            this.entities.delete(key);
            return;
        }

        let ent: Entity;
        switch (type) {
            case 'source':
                ent = { type: 'source', pos, power: 10, active: true, minActivation: 0, groupId: 1 };
                break;
            case 'sink':
                ent = { type: 'sink', pos, stored: 0, pullRate: 0.1, dumpMax: 1, capacityScale: 10, conductivity: 1.0 };
                break;
            case 'shield':
                ent = { type: 'shield', pos, conductivity: 0.0001, groupId: 1 };
                break;
            case 'probe':
                ent = { type: 'probe', pos, groupId: 1 };
                break;
        }
        this.entities.set(key, ent);
    }

    public serialize(): string {
        // Only saving entities as requested
        const data = {
            radius: this.radius,
            entities: Array.from(this.entities.entries())
        };
        return JSON.stringify(data);
    }

    public deserialize(json: string) {
        try {
            const data = JSON.parse(json);
            
            // 1. Restore Radius & Grid
            if (typeof data.radius === 'number') {
                this.radius = data.radius;
                const cubes = generateHexagon(this.radius);
                this.E.clear();
                for (const c of cubes) {
                    this.E.set(cubeKey(c), 0);
                }
            }
            
            // 2. Restore Entities
            if (data.entities && Array.isArray(data.entities)) {
                this.entities.clear();
                // E is already reset above
                
                for (const [key, ent] of data.entities) {
                    // Start fresh with 0 temp, or maybe keep what generateHexagon gave us (0)
                    // If the save file contained keys NOT in the new radius, they will be effectively ignored
                    // unless we just trust the entity list. 
                    // But we want the full grid.
                    
                    // Filter: Only add entity if it fits on the board? 
                    // Or allow "off-board" entities? 
                    // Let's assume the saved entities match the radius.
                    if (this.E.has(key)) {
                        this.entities.set(key, ent);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load map:", e);
        }
    }
}
