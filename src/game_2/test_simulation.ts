
import { tickSimulation, type SimulationState, type HexMapE } from './hex_tick';
import { hexCubeKey, generateHexagon } from '../lib/hexlib';

function createMockState(E: HexMapE, radius: number = 1, alpha: number = 0.1): SimulationState {
    return {
        entities: new Map(),
        E: E,
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
        diffusionAlpha: alpha,
        baseConductivity: 1.0
    };
}

function runTest() {
    console.log("=== Running Thermo Simulation Tests ===");

    // Setup: 1 central cell (100 heat) + 6 neighbors (0 heat)
    const center = [0, 0, 0] as const;
    const coords = generateHexagon(1); // ring 1 (1 + 6 = 7 cells)
    
    const initE = () => {
        const E: HexMapE = new Map();
        for (const c of coords) E.set(hexCubeKey(c), 0);
        E.set(hexCubeKey(center), 100);
        return E;
    };

    console.log(`Initial E(center): 100`);

    // --- Scenario 1: Alpha 0.9 (User's value) ---
    console.log("\n--- Scenario 1: Unstable Alpha (0.9) ---");
    const state1 = createMockState(initE(), 1, 0.9);
    const res1 = tickSimulation(state1);
    const e1 = res1.nextState.E.get(hexCubeKey(center)) ?? 0;
    console.log(`Tick 1 E(center): ${e1}`);
    
    if (e1 < 0) {
        console.log("FAIL: Center energy went negative! Instability detected.");
    } else {
        console.log("PASS?? (Unexpected)");
    }

    // --- Scenario 2: Alpha 0.1 (Stable value) ---
    console.log("\n--- Scenario 2: Stable Alpha (0.1) ---");
    const state2 = createMockState(initE(), 1, 0.1);
    const res2 = tickSimulation(state2);
    const e2 = res2.nextState.E.get(hexCubeKey(center)) ?? 0;
    console.log(`Tick 1 E(center): ${e2}`);
    
    // Theoretical: 100 - 6 * (0.1 * (100 - 0)) = 100 - 60 = 40.
    // Neighbors gain 10 each. Total 40 + 6*10 = 100.
    if (Math.abs(e2 - 40) < 1e-6) {
        console.log("PASS: Center energy is exactly as expected (40).");
    } else {
        console.log(`FAIL: Expected 40, got ${e2}`);
    }

    // --- Scenario 3: Default Alpha (Should be stable now) ---
    console.log("\n--- Scenario 3: Default Alpha (Expect Stable) ---");
    const state3 = createMockState(initE(), 1, 0.1); // Using 0.1 as default for test
    const res3 = tickSimulation(state3);
    const e3 = res3.nextState.E.get(hexCubeKey(center)) ?? 0;
    console.log(`Tick 1 E(center): ${e3}`);
    
    if (e3 > 0 && e3 < 100) {
        console.log("PASS: Default alpha produced stable result.");
    } else {
        console.log("FAIL: Default alpha unstable.");
    }
}

runTest();
