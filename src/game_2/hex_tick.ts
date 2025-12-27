// thermo_hex_tick.ts
// Cube-coordinate hex thermodynamics tick:
// - Sources inject into their own cell
// - Diffusion redistributes energy (lossless, conservative)
// - Shields "interfere" with diffusion via lower conductivity (not blocking)
// - Sinks have a reservoir; they pull from local medium slowly, and dump to heat
//   at a rate inversely correlated with their stored heat.
// - Returns the next tick's E field (and also the updated sink reservoirs + diagnostics)


import {type Cube, CUBE_DIRS, cubeKey, type CubeKey, parseCubeKey} from "../lib/hexlib.ts";

export type HexMapE = Map<CubeKey, number>;

export interface CapacitorState {
    stored: number;
    capacity: number;
    drainRate: number;
    surchargeCost: number;
}

export interface Source {
    pos: Cube;
    /** energy injected each tick while active */
    power: number;
    /** if false, ignored */
    active: boolean;
    /** Group ID for throttling (default 1) */
    groupId?: number;
}

export interface Shield {
    pos: Cube;
    /**
     * Conductivity multiplier in (0,1], where 1 = normal cell,
     * lower = slows diffusion through this cell.
     */
    conductivity: number;
    /** Group ID for toggling (default 1) */
    groupId?: number;
}

export interface Sink {
    pos: Cube;
    /**
     * Reservoir stored heat at the sink cell (stateful).
     * The sink pulls from the medium into this reservoir, then dumps from reservoir to "heat".
     */
    stored: number;

    /**
     * Fraction of local medium energy pulled into reservoir each tick (slow accumulation).
     * Typical: 0.02 .. 0.08
     */
    pullRate: number;

    /**
     * Max dump rate when cool (stored ~ 0).
     * Typical: ~0.5 .. 3 depending on your energy scales
     */
    dumpMax: number;

    /**
     * Saturation scale: higher means sink stays effective longer as it heats up.
     * Dump rate is: dumpMax / (1 + stored / capacityScale)
     */
    capacityScale: number;

    /**
     * Conductivity multiplier for diffusion through sink cell.
     * If omitted, sink cells behave like normal medium in diffusion.
     */
    conductivity?: number;
}

export interface Probe {
    pos: Cube;
    groupId: number; // 1-4
}

export interface TickParams {
    /**
     * Global diffusion strength per tick. Must be small-ish for stability.
     * Typical: 0.05 .. 0.2
     */
    diffusionAlpha?: number;

    /**
     * Default conductivity for normal cells.
     */
    baseConductivity?: number;

    /**
     * Throttles for source groups. Map<groupId, factor 0..1>.
     * If missing, assumes 1.0.
     */
    throttles?: Map<number, number>;

    /**
     * Set of disabled shield group IDs.
     * If a shield's group is in this set, it is ignored (conducts normally).
     */
    disabledShieldGroups?: Set<number>;

    /**
     * Throttles for probe groups. Map<groupId, factor 0..1>.
     * If missing, assumes 0.0 (OFF).
     */
    probeThrottles?: Map<number, number>;

    /**
     * Capacitor states for probe groups. Map<groupId, CapacitorState>.
     * If provided, logic will fill/drain them and zero-throttle if full.
     */
    capacitors?: Map<number, CapacitorState>;
}

export interface TickResult {
    /** Next tick E field */
    E: HexMapE;
    /** Updated sinks (stored heat changed) */
    sinks: Sink[];
    /** Total heat dumped out of the system this tick (diagnostic) */
    heatDumped: number;
    /** Energy collected by probes per group */
    energyCollected: Map<number, number>;
    /** Updated capacitor states */
    updatedCapacitors: Map<number, CapacitorState>;
}

/**
 * Compute next-tick energy field with sources, shields, sinks.
 *
 * Notes:
 * - The input E map defines the board domain. Only keys present in E exist.
 * - Sources/shields/sinks outside the domain are ignored.
 * - Diffusion is conservative across the domain BEFORE sink dumping.
 */
export function tickThermo(
    E: HexMapE,
    sources: ReadonlyArray<Source>,
    shields: ReadonlyArray<Shield>,
    sinks: ReadonlyArray<Sink>,
    probes: ReadonlyArray<Probe> = [],
    params: TickParams = {}
): TickResult {
    const alpha = params.diffusionAlpha ?? 0.10;
    const baseK = params.baseConductivity ?? 1.0;
    const throttles = params.throttles;
    const disabledShields = params.disabledShieldGroups;
    // We will build "effective" probe throttles based on capacitor state
    const inputProbeThrottles = params.probeThrottles; 
    const capacitors = params.capacitors;

    // --- 0) Capacitor Logic ---
    const updatedCapacitors = new Map<number, CapacitorState>();
    const effectiveProbeThrottles = new Map<number, number>();

    // Copy input throttles first
    if (inputProbeThrottles) {
        for (const [g, t] of inputProbeThrottles) effectiveProbeThrottles.set(g, t);
    }

    if (capacitors) {
        for (const [groupId, cap] of capacitors) {
            // Clone state
            const nextCap = { ...cap };

            // Check if full (BEFORE drain, to enforce stop-at-full)
            if (nextCap.stored >= nextCap.capacity) {
                effectiveProbeThrottles.set(groupId, 0);
            }

            // Drain (always happens)
            nextCap.stored = Math.max(0, nextCap.stored - nextCap.drainRate);

            // If we were full, we might have dropped below capacity now.
            // But we already set the throttle to 0 for THIS tick.
            
            // Re-clamp just in case (though drain reduces it)
            if (nextCap.stored > nextCap.capacity) nextCap.stored = nextCap.capacity;

            updatedCapacitors.set(groupId, nextCap);
        }
    }

    // Clone E into a working map (we'll build nextE)
    const nextE: HexMapE = new Map();
    for (const [k, v] of E.entries()) nextE.set(k, v);

    // Build fast lookup tables for conductivities and sinks
    const conductivityByKey = new Map<CubeKey, number>();

    // Start with base conductivity for all cells in domain
    for (const k of E.keys()) conductivityByKey.set(k, baseK);

    // Apply shields (min with existing so multiple modifiers behave nicely)
    for (const sh of shields) {
        if (sh.groupId !== undefined && disabledShields && disabledShields.has(sh.groupId)) {
            continue; // Skip disabled shields
        }

        const k = cubeKey(sh.pos);
        if (!E.has(k)) continue;
        const cur = conductivityByKey.get(k) ?? baseK;
        conductivityByKey.set(k, Math.min(cur, clamp01Positive(sh.conductivity)));
    }

    // Apply sink conductivity if provided
    for (const si of sinks) {
        const k = cubeKey(si.pos);
        if (!E.has(k)) continue;
        if (si.conductivity === undefined) continue;
        const cur = conductivityByKey.get(k) ?? baseK;
        conductivityByKey.set(k, Math.min(cur, clamp01Positive(si.conductivity)));
    }

    // --- 1) Source injection (local) ---
    for (const s of sources) {
        if (!s.active) continue;
        const k = cubeKey(s.pos);
        if (!nextE.has(k)) continue;
        
        let throttle = 1.0;
        if (throttles && s.groupId !== undefined) {
             throttle = throttles.get(s.groupId) ?? 1.0;
        }

        nextE.set(k, (nextE.get(k) ?? 0) + (s.power * throttle));
    }

    // --- 2) Diffusion (lossless) ---
    // We iterate each undirected edge once to avoid double counting:
    // For each cell, only consider 3 of the 6 directions (e.g. dirs 0,1,2).
    // Flux from a->b is k_edge * alpha * (Ea - Eb), applied symmetrically.
    const deltaE: Map<CubeKey, number> = new Map();
    for (const k of nextE.keys()) deltaE.set(k, 0);

    const halfDirs: readonly Cube[] = [CUBE_DIRS[0], CUBE_DIRS[1], CUBE_DIRS[2]];

    for (const aKey of nextE.keys()) {
        const aPos = parseCubeKey(aKey);
        const Ea = nextE.get(aKey) ?? 0;
        const ka = conductivityByKey.get(aKey) ?? baseK;

        for (const [dx, dy, dz] of halfDirs) {
            const bPos: Cube = [aPos[0] + dx, aPos[1] + dy, aPos[2] + dz] as const;
            const bKey = cubeKey(bPos);
            if (!nextE.has(bKey)) continue; // outside domain

            const Eb = nextE.get(bKey) ?? 0;
            const kb = conductivityByKey.get(bKey) ?? baseK;

            const kEdge = Math.min(ka, kb);
            const flux = kEdge * alpha * (Ea - Eb);

            // Apply symmetrically: a loses flux, b gains flux
            deltaE.set(aKey, (deltaE.get(aKey) ?? 0) - flux);
            deltaE.set(bKey, (deltaE.get(bKey) ?? 0) + flux);
        }
    }

    for (const [k, d] of deltaE.entries()) {
        nextE.set(k, (nextE.get(k) ?? 0) + d);
    }

    // --- 3) Sink exchange (stateful) ---
    // Each sink:
    //  a) pulls x = pullRate * E_local from medium into reservoir
    //  b) dumps y = min(stored, dumpMax / (1 + stored/capacityScale)) out of system
    let heatDumped = 0.0;
    const nextSinks: Sink[] = sinks.map(s => ({ ...s }));

    for (const si of nextSinks) {
        const k = cubeKey(si.pos);
        if (!nextE.has(k)) continue;

        const localE = nextE.get(k) ?? 0;

        const pull = clamp01(si.pullRate) * localE;
        nextE.set(k, localE - pull);
        si.stored += pull;

        const cap = Math.max(1e-9, si.capacityScale);
        const dumpRate = si.dumpMax / (1 + si.stored / cap);
        const dump = Math.min(si.stored, Math.max(0, dumpRate));

        si.stored -= dump;
        heatDumped += dump;
    }

    // --- 4) Probe Extraction (Groups) ---
    // Heat Engine Model:
    // 1. Heat flows from Hot -> Cold probes.
    // 2. We extract Work from this flow.
    // 3. Q_move = Excess * Throttle * Rate
    // 4. Work = Q_move * Efficiency
    // 5. Q_dump = Q_move - Work (goes to cold probes)
    
    const energyCollected = new Map<number, number>();
    const PROBE_TRANSFER_RATE = 0.9; // Fraction of excess moved per tick
    const ENGINE_EFFICIENCY = 0.3;

    // Group probes by ID
    const probeGroups = new Map<number, CubeKey[]>();
    for (const p of probes) {
        if (!probeGroups.has(p.groupId)) probeGroups.set(p.groupId, []);
        probeGroups.get(p.groupId)!.push(cubeKey(p.pos));
    }

    for (const [groupId, keyList] of probeGroups.entries()) {
        const throttle = effectiveProbeThrottles.get(groupId) ?? 0.0;
        if (throttle <= 0) {
            continue;
        }

        // Check capacitor room to limit collection
        let maxWorkAllowed = Infinity;
        if (updatedCapacitors.has(groupId)) {
            const cap = updatedCapacitors.get(groupId)!;
            const room = cap.capacity - cap.stored;
            if (room <= 0) continue; // Should be handled by throttle=0 check, but safe to keep
            maxWorkAllowed = room;
        }

        // 1. Calculate Mean
        let totalE = 0;
        let count = 0;
        const values = new Map<CubeKey, number>();

        for (const k of keyList) {
            if (!nextE.has(k)) continue;
            const val = nextE.get(k) ?? 0;
            values.set(k, val);
            totalE += val;
            count++;
        }

        if (count < 2) continue; // Need at least 2 to transfer
        const mean = totalE / count;

        // 2. Calculate Excess (Heat above mean)
        let totalExcess = 0;
        let totalDeficit = 0;

        for (const val of values.values()) {
            if (val > mean) totalExcess += (val - mean);
            else totalDeficit += (mean - val);
        }

        if (totalExcess < 0.0001) continue; // Equilibrium

        // 3. Move Heat
        // We move a fraction of the excess towards the mean
        let qMove = totalExcess * throttle * PROBE_TRANSFER_RATE;

        // Clamp qMove based on maxWorkAllowed
        // Work = qMove * EFF -> qMove = Work / EFF
        const maxQMove = maxWorkAllowed / ENGINE_EFFICIENCY;
        if (qMove > maxQMove) {
            qMove = maxQMove;
        }

        // 4. Extract Work
        const work = qMove * ENGINE_EFFICIENCY;
        const qDump = qMove - work;

        // 5. Apply Changes
        for (const [k, val] of values.entries()) {
            let change = 0;
            if (val > mean) {
                // Hot probe: Loses heat proportional to its excess
                const share = (val - mean) / totalExcess;
                change = -1 * qMove * share;
            } else if (val < mean && totalDeficit > 0) {
                // Cold probe: Gains waste heat proportional to its deficit
                const share = (mean - val) / totalDeficit;
                change = qDump * share;
            }
            
            // Apply
            const current = nextE.get(k) ?? 0;
            nextE.set(k, current + change);
        }

        energyCollected.set(groupId, work);
        
        // Update capacitor if present
        if (updatedCapacitors.has(groupId)) {
            const cap = updatedCapacitors.get(groupId)!;
            cap.stored = Math.min(cap.capacity, cap.stored + work);
            // Re-check full state? It won't affect *this* tick's throttle, but next tick's.
        }
    }

    // Small numeric cleanup (optional)
    for (const [k, v] of nextE.entries()) {
        // prevent -0 and tiny negative drift from float math
        nextE.set(k, Math.abs(v) < 1e-12 ? 0 : v);
    }
    
    return { E: nextE, sinks: nextSinks, heatDumped, energyCollected, updatedCapacitors };
}


// ------------------ helpers ------------------

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** conductivity can be >1 if you want superconductor cells; this clamps only negatives to 0 */
function clamp01Positive(v: number): number {
    return v < 0 ? 0 : v;
}
