import { parseHexCubeKey, type HexCubeKey } from '../lib/hexlib';
import {
    tickSimulation, 
    type SimulationState, 
    type Entity
} from './hex_tick';

export class ThermoGame {
    public state: SimulationState;

    constructor(initialKeys?: Iterable<HexCubeKey>, radius: number = 8) {
        this.state = {
            entities: new Map(),
            E: new Map(),
            capacitors: new Map(),
            reservoirs: new Map(),
            groupThrottles: new Map(),
            probeThrottles: new Map(),
            disabledShieldGroups: new Set(),
            totalEnergyCollected: new Map(),
            lastTickEnergy: new Map(),
            lastCapacitorDelta: new Map(),
            lastDeltaE: new Map(),
            tickCount: 0,
            radius: radius,
            diffusionAlpha: 0.1,
            baseConductivity: 1.0
        };

        if (initialKeys) {
            for (const key of initialKeys) {
                this.state.E.set(key, 0);
            }
        }

        // Init Capacitors & Throttles
        for (const i of [1, 2, 3, 4]) {
            this.state.groupThrottles.set(i, 1.0);
            this.state.probeThrottles.set(i, 0.0);
            this.state.totalEnergyCollected.set(i, 0.0);
            this.state.capacitors.set(i, {
                id: i,
                stored: 0,
                capacity: 1000,
                drainRate: 1,
                surchargeCost: 500
            });
        }
        
        // Init Reservoirs
        for (const i of [1, 2, 3, 4, 5, 6]) {
            this.state.reservoirs.set(i, {
                id: i,
                heat: 0,
                volume: 5000,
                radiator: { deployed: false, strength: 50 }
            });
        }
    }

    public tick() {
        const result = tickSimulation(this.state);
        this.state = result.nextState;
    }

    public dischargeBank(groupId: number): boolean {
        const cap = this.state.capacitors.get(groupId);
        if (!cap) return false;
        
        if (cap.stored >= cap.surchargeCost) {
            cap.stored -= cap.surchargeCost;
            return true;
        }
        return false;
    }

    public toggleShieldGroup(groupId: number) {
        if (this.state.disabledShieldGroups.has(groupId)) {
            // Enabling: Restore temp
            this.state.disabledShieldGroups.delete(groupId);
            for (const [k, e] of this.state.entities) {
                if (e.type === 'shield' && e.groupId === groupId) {
                    if (e.savedTemp !== undefined) {
                        this.state.E.set(k, e.savedTemp);
                        e.savedTemp = undefined;
                    }
                }
            }
        } else {
            // Disabling: Save temp
            this.state.disabledShieldGroups.add(groupId);
            for (const [k, e] of this.state.entities) {
                if (e.type === 'shield' && e.groupId === groupId) {
                    e.savedTemp = this.state.E.get(k) || 0;
                }
            }
        }
    }

    public setEntity(key: HexCubeKey, type: 'source'|'sink'|'shield'|'probe'|'empty') {
        const pos = parseHexCubeKey(key);
        if (type === 'empty') {
            this.state.entities.delete(key);
            return;
        }

        let ent: Entity;
        switch (type) {
            case 'source':
                ent = { type: 'source', pos, power: 10, active: true, minActivation: 0, groupId: 1 };
                break;
            case 'sink':
                ent = { type: 'sink', pos, pullRate: 0.1, conductivity: 0.8, groupId: 1 };
                break;
            case 'shield':
                ent = { type: 'shield', pos, conductivity: 0.0001, groupId: 1 };
                break;
            case 'probe':
                ent = { type: 'probe', pos, groupId: 1 };
                break;
        }
        this.state.entities.set(key, ent);
    }

    public serialize(): string {
        return JSON.stringify({
            entities: Array.from(this.state.entities.entries()),
            capacitors: Array.from(this.state.capacitors.entries()),
            reservoirs: Array.from(this.state.reservoirs.entries()),
            groupThrottles: Array.from(this.state.groupThrottles.entries()),
            probeThrottles: Array.from(this.state.probeThrottles.entries()),
            disabledShieldGroups: Array.from(this.state.disabledShieldGroups)
        });
    }

    public deserialize(json: string) {
        try {
            const data = JSON.parse(json);
            
            // Clear current
            this.state.entities.clear();
            
            if (data.entities) {
                for (const [k, ent] of data.entities) {
                    // Check for legacy sinks (no groupId)
                    if (ent.type === 'sink' && ent.groupId === undefined) {
                        ent.groupId = 1; // Default legacy to Group 1
                        console.log("Migrated legacy sink to Group 1");
                    }
                     // Check for legacy sinks (extra fields)
                    if (ent.type === 'sink' && 'stored' in ent) {
                        delete (ent as any).stored;
                        delete (ent as any).capacityScale;
                        delete (ent as any).dumpMax;
                    }

                    this.state.entities.set(k, ent);
                }
            }
            
            // Restore Capacitors if present
            if (data.capacitors) {
                this.state.capacitors.clear();
                for (const [id, cap] of data.capacitors) {
                    this.state.capacitors.set(id, cap);
                }
            }
            
            // Restore Reservoirs if present
            if (data.reservoirs) {
                this.state.reservoirs.clear();
                for (const [id, res] of data.reservoirs) {
                    this.state.reservoirs.set(id, {
                        ...res,
                         // Ensure radiator object exists if loading old save
                        radiator: res.radiator || { deployed: false, strength: 50 } 
                    });
                }
            } else {
                 // Reset Reservoirs if new save
                 for (const i of [1, 2, 3, 4, 5, 6]) {
                    if (!this.state.reservoirs.has(i)) {
                         this.state.reservoirs.set(i, {
                            id: i,
                            heat: 0,
                            volume: 5000,
                            radiator: { deployed: false, strength: 50 }
                        });
                    }
                }
            }

            // Restore Throttles if present
            if (data.groupThrottles) {
                this.state.groupThrottles.clear();
                for (const [id, val] of data.groupThrottles) {
                    this.state.groupThrottles.set(id, val);
                }
            } else {
                 // Reset if not found
                 for (const i of [1,2,3,4]) this.state.groupThrottles.set(i, 1.0);
            }

            if (data.probeThrottles) {
                this.state.probeThrottles.clear();
                for (const [id, val] of data.probeThrottles) {
                    this.state.probeThrottles.set(id, val);
                }
            } else {
                for (const i of [1,2,3,4]) this.state.probeThrottles.set(i, 0.0);
            }

            // Restore Disabled Shield Groups
            if (data.disabledShieldGroups) {
                this.state.disabledShieldGroups.clear();
                for (const id of data.disabledShieldGroups) {
                    this.state.disabledShieldGroups.add(id);
                }
            } else {
                this.state.disabledShieldGroups.clear();
            }

            // Note: We don't save E field, throttles, etc.
            // Reset E
            for (const k of this.state.E.keys()) {
                this.state.E.set(k, 0); // Clear heat
            }
            
        } catch (e) {
            console.error("Failed to load layout", e);
        }
    }
}

