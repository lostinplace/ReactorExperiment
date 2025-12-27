// thermo_hex_tick.ts
import {type HexCubeCoord, HEX_CUBE_DIRS, hexCubeKey, type HexCubeKey, parseHexCubeKey} from "../lib/hexlib.ts";


export type HexMapE = Map<HexCubeKey, number>;

export interface CapacitorState {
    id: number;
    stored: number;
    capacity: number;
    drainRate: number;
    surchargeCost: number;
}

export interface ReservoirState {
    id: number;
    heat: number;
    volume: number;
    radiator: { deployed: boolean; strength: number; };
}

// --- Entity Types ---
export interface EntityCommon {
    pos: HexCubeCoord;
    groupId?: number; // 1-4, or 1-6 for sinks
    disabled?: boolean;
    destroyed?: boolean;
    type: string;
}

export interface SourceEntity extends EntityCommon {
    type: 'source';
    power: number;
    active: boolean;
    minActivation: number;
}

export interface SinkEntity extends EntityCommon {
    type: 'sink';
    pullRate: number;
    conductivity: number;
    groupId: number; // 1-6
}

export interface ShieldEntity extends EntityCommon {
    type: 'shield';
    conductivity: number;
    savedTemp?: number;
}

export interface ProbeEntity extends EntityCommon {
    type: 'probe';
}

export type Entity = SourceEntity | SinkEntity | ShieldEntity | ProbeEntity;

// --- State Types ---
export interface SimulationState {
    // Entities and Grid
    entities: Map<HexCubeKey, Entity>;
    E: HexMapE; // energy field
    
    // Core Infrastructure
    capacitors: Map<number, CapacitorState>;
    reservoirs: Map<number, ReservoirState>;

    // Controls / Throttles
    groupThrottles: Map<number, number>; // 0..1
    probeThrottles: Map<number, number>; // 0..1
    disabledShieldGroups: Set<number>;

    // Stats / History
    totalEnergyCollected: Map<number, number>;
    lastTickEnergy: Map<number, number>;
    lastCapacitorDelta: Map<number, number>;
    lastDeltaE: Map<string, number>;
    
    tickCount: number;
    
    // Config
    radius: number;
    diffusionAlpha: number;
    baseConductivity: number;
}


// --- Tick Logic ---

export interface TickResult {
    energyCollected: Map<number, number>;
    nextState: SimulationState;
}

/**
 * Updates the simulation state in place (or partially inplace).
 */
export function tickSimulation(state: SimulationState): TickResult {
    // 1. Clone mutable state
    const nextState: SimulationState = {
        ...state,
        E: new Map(state.E),
        capacitors: new Map(),
        reservoirs: new Map(),
        totalEnergyCollected: new Map(state.totalEnergyCollected),
        lastTickEnergy: new Map(),
        lastCapacitorDelta: new Map(),
        lastDeltaE: new Map(),
        tickCount: state.tickCount + 1
    };

    // Deep copy objects in maps
    for (const [id, cap] of state.capacitors) {
        nextState.capacitors.set(id, { ...cap });
    }
    for (const [id, res] of state.reservoirs) {
        nextState.reservoirs.set(id, { ...res, radiator: { ...res.radiator } });
    }

    const { diffusionAlpha: alpha, baseConductivity: baseK } = state;
    
    // --- 0) Entity Sorting ---
    const sources: SourceEntity[] = [];
    const sinks: SinkEntity[] = [];
    const shields: ShieldEntity[] = [];
    const probes: ProbeEntity[] = [];

    for (const ent of state.entities.values()) {
        if (ent.type === 'source') sources.push(ent);
        else if (ent.type === 'sink') sinks.push(ent);
        else if (ent.type === 'shield') shields.push(ent);
        else if (ent.type === 'probe') probes.push(ent);
    }

    // --- 0.2) Capacitor Logic ---
    const initialCapStored = new Map<number, number>();
    for (const [id, cap] of nextState.capacitors) {
        initialCapStored.set(id, cap.stored);
    }

    const effectiveProbeThrottles = new Map<number, number>();
    for (const [g, t] of state.probeThrottles) effectiveProbeThrottles.set(g, t);

    for (const [groupId, cap] of nextState.capacitors) {
        if (cap.stored >= cap.capacity) {
            effectiveProbeThrottles.set(groupId, 0);
        }
        cap.stored = Math.max(0, cap.stored - cap.drainRate);
        if (cap.stored > cap.capacity) cap.stored = cap.capacity;
    }
    
    // --- 0.5) Snap Sinks to Reservoir Temp & Prep Reservoirs ---
    // Start of tick: Sinks act as surface of the reservoir.
    for (const sink of sinks) {
        const res = nextState.reservoirs.get(sink.groupId);
        if (res) {
            // Safety: avoid NaN if volume is 0 (though should not happen)
            const vol = Math.max(1, res.volume);
            const resE = res.heat / vol;
            const k = hexCubeKey(sink.pos);
            nextState.E.set(k, resE);
        }
    }

    // --- 1) Grid Prep ---
    const conductivityByKey = new Map<HexCubeKey, number>();
    for (const k of nextState.E.keys()) conductivityByKey.set(k, baseK);

    for (const sh of shields) {
        if (sh.groupId !== undefined && state.disabledShieldGroups.has(sh.groupId)) continue;
        const k = hexCubeKey(sh.pos);
        if (!nextState.E.has(k)) continue;
        const cur = conductivityByKey.get(k) ?? baseK;
        conductivityByKey.set(k, Math.min(cur, clamp01Positive(sh.conductivity)));
    }

    for (const si of sinks) {
        const k = hexCubeKey(si.pos);
        if (!nextState.E.has(k)) continue;
        const cur = conductivityByKey.get(k) ?? baseK;
        conductivityByKey.set(k, Math.min(cur, clamp01Positive(si.conductivity)));
    }

    // --- 2) Source injection ---
    // Track source input specifically for sinks to move it to reservoir
    const sourceInputs = new Map<HexCubeKey, number>();

    for (const s of sources) {
        if (!s.active) continue;
        const k = hexCubeKey(s.pos);
        if (!nextState.E.has(k)) continue;
        
        let throttle = 1.0;
        if (s.groupId !== undefined) {
             throttle = state.groupThrottles.get(s.groupId) ?? 1.0;
        }

        const added = s.power * throttle;
        nextState.E.set(k, (nextState.E.get(k) ?? 0) + added);
        sourceInputs.set(k, (sourceInputs.get(k) ?? 0) + added);
    }

    // --- 3) Diffusion ---
    const deltaE = new Map<string, number>(); // Flux accumulation
    for (const k of nextState.E.keys()) deltaE.set(k, 0);
    const halfDirs: readonly HexCubeCoord[] = [HEX_CUBE_DIRS[0], HEX_CUBE_DIRS[1], HEX_CUBE_DIRS[2]];

    for (const aKey of nextState.E.keys()) {
        const aPos = parseHexCubeKey(aKey);
        const Ea = nextState.E.get(aKey) ?? 0;
        const ka = conductivityByKey.get(aKey) ?? baseK;

        for (const [dx, dy, dz] of halfDirs) {
            const bPos: HexCubeCoord = [aPos[0] + dx, aPos[1] + dy, aPos[2] + dz] as const;
            const bKey = hexCubeKey(bPos);
            if (!nextState.E.has(bKey)) continue;

            const Eb = nextState.E.get(bKey) ?? 0;
            const kb = conductivityByKey.get(bKey) ?? baseK;
            const kEdge = Math.min(ka, kb);
            const flux = kEdge * alpha * (Ea - Eb);

            deltaE.set(aKey, (deltaE.get(aKey) ?? 0) - flux);
            deltaE.set(bKey, (deltaE.get(bKey) ?? 0) + flux);
        }
    }

    // --- 4) Sink / Reservoir Exchange (Bi-directional) ---
    // Instead of applying deltaE to sinks, we move that energy to the reservoir.
    const sinkKeys = new Set<string>();
    for (const sink of sinks) sinkKeys.add(hexCubeKey(sink.pos));

    for (const sink of sinks) {
        const k = hexCubeKey(sink.pos);
        const res = nextState.reservoirs.get(sink.groupId);
        if (res) {
            // Net energy attempting to change Sink E:
            // 1. Source Injection (already in nextState.E, tracked in sourceInputs)
            // 2. Diffusion (in deltaE)
            
            // Wait, nextState.E[k] currently holds (ResStartE + SourceInput).
            // We want to extract SourceInput + DiffusionInput -> Reservoir.
            
            const srcIn = sourceInputs.get(k) ?? 0;
            const diffIn = deltaE.get(k) ?? 0;
            const totalIn = srcIn + diffIn;
            
            res.heat += totalIn;
        }
    }

    // --- 5) Reservoir Update ---
    for (const res of nextState.reservoirs.values()) {
        if (res.radiator.deployed) {
            const loss = Math.min(res.heat, res.radiator.strength);
            res.heat -= loss;
        }
    }

    // Update Sink E to match new Reservoir E
    // Apply deltaE to non-sinks
    for (const [k, d] of deltaE.entries()) {
        if (sinkKeys.has(k)) {
             // Sink: Force to new Res E
             // We need to find *which* reservoir. (Lookup map or re-loop)
             // handled below.
        } else {
             nextState.E.set(k, (nextState.E.get(k) ?? 0) + d);
        }
    }
    
    // Re-loop sinks to snap to FINAL reservoir temp
    for (const sink of sinks) {
        const res = nextState.reservoirs.get(sink.groupId);
        if (res) {
            const k = hexCubeKey(sink.pos);
            const vol = Math.max(1, res.volume); // avoid div zero
            nextState.E.set(k, res.heat / vol);
        }
    }


    // --- 6) Capacitor & Probe Collection ---
    const energyCollected = new Map<number, number>();
    const PROBE_TRANSFER_RATE = 0.9;
    const ENGINE_EFFICIENCY = 0.3;

    const probeGroups = new Map<number, HexCubeKey[]>();
    for (const p of probes) {
        const gid = p.groupId ?? 1;
        if (!probeGroups.has(gid)) probeGroups.set(gid, []);
        probeGroups.get(gid)!.push(hexCubeKey(p.pos));
    }

    for (const [groupId, keyList] of probeGroups.entries()) {
        const throttle = effectiveProbeThrottles.get(groupId) ?? 0.0;
        if (throttle <= 0) continue;

        let maxWorkAllowed = Infinity;
        if (nextState.capacitors.has(groupId)) {
            const cap = nextState.capacitors.get(groupId)!;
            const room = cap.capacity - cap.stored;
            if (room <= 0) continue;
            maxWorkAllowed = room;
        }

        let totalE = 0;
        let count = 0;
        const values = new Map<HexCubeKey, number>();

        for (const k of keyList) {
            if (!nextState.E.has(k)) continue;
            const val = nextState.E.get(k) ?? 0;
            values.set(k, val);
            totalE += val;
            count++;
        }

        if (count < 2) continue;
        const mean = totalE / count;
        let totalExcess = 0;
        let totalDeficit = 0;
        for (const val of values.values()) {
            if (val > mean) totalExcess += (val - mean);
            else totalDeficit += (mean - val);
        }

        if (totalExcess < 0.0001) continue;

        let qMove = totalExcess * throttle * PROBE_TRANSFER_RATE;
        const maxQMove = maxWorkAllowed / ENGINE_EFFICIENCY;
        if (qMove > maxQMove) qMove = maxQMove;

        const work = qMove * ENGINE_EFFICIENCY;
        const qDump = qMove - work;

        for (const [k, val] of values.entries()) {
            let change = 0;
            if (val > mean) {
                const share = (val - mean) / totalExcess;
                change = -1 * qMove * share;
            } else if (val < mean && totalDeficit > 0) {
                const share = (mean - val) / totalDeficit;
                change = qDump * share;
            }
            nextState.E.set(k, (nextState.E.get(k) ?? 0) + change);
        }

        energyCollected.set(groupId, work);
        if (nextState.capacitors.has(groupId)) {
            const cap = nextState.capacitors.get(groupId)!;
            cap.stored = Math.min(cap.capacity, cap.stored + work);
        }
    }

    // Cleanup & Apply
    for (const [k, v] of nextState.E.entries()) {
        const cleaned = Math.abs(v) < 1e-12 ? 0 : v;
        const old = state.E.get(k) ?? 0;
        nextState.lastDeltaE.set(k, cleaned - old);
        nextState.E.set(k, cleaned);
    }
    
    // Finalize Capacitor Deltas
    for (const [id, cap] of nextState.capacitors) {
        const start = initialCapStored.get(id) ?? cap.stored;
        nextState.lastCapacitorDelta.set(id, cap.stored - start);
    }

    nextState.lastTickEnergy = energyCollected;
    for (const [gid, amt] of energyCollected) {
        const cur = nextState.totalEnergyCollected.get(gid) ?? 0;
        nextState.totalEnergyCollected.set(gid, cur + amt);
    }

    return { energyCollected, nextState };
}


function clamp01Positive(v: number): number {
    return v < 0 ? 0 : v;
}
