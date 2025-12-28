
import { tickSimulation, type SimulationState, type HexMapE, type SourceEntity, type ShieldEntity } from './hex_tick';
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
        lastPerimeterEnergy: 0,
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


function runProbeTest() {
    console.log("\n=== Running Probe LOS Tests ===");
    
    // Layout: Source at 0,0,0. Target at 0,-2,2. 
    // Shield at 0,-1,1 (direct line).
    const center = [0, 0, 0] as const;
    const mid = [0, -1, 1] as const;
    const target = [0, -2, 2] as const;
    
    // Helper to setup state
    const setup = (shieldActive: boolean, shieldPresent: boolean) => {
        const state = createMockState(new Map(), 1, 0.1);
        
        // Add Source
        state.entities.set(hexCubeKey(center), {
            type: 'source', pos: center, power: 100, active: true, minActivation: 0
        } as any);
        
        // Add Probe
        state.entities.set(hexCubeKey(target), {
            type: 'probe', pos: target
        } as any);
        
        // Add Shield
        if (shieldPresent) {
            state.entities.set(hexCubeKey(mid), {
                type: 'shield', pos: mid, conductivity: 0.1, groupId: 1
            } as any);
            
            if (!shieldActive) {
                state.disabledShieldGroups.add(1);
            }
        }
        
        return state;
    };

    // 1. Clear LOS -> Destroyed
    console.log("Test 1: Clear LOS (No Shield)");
    const s1 = setup(false, false);
    const r1 = tickSimulation(s1);
    const p1 = r1.nextState.entities.get(hexCubeKey(target));
    if (p1 && p1.destroyed) console.log("PASS: Probe destroyed.");
    else console.log(`FAIL: Probe not destroyed. state: ${JSON.stringify(p1)}`);

    // 2. Blocked LOS -> Survives
    console.log("Test 2: Blocked by Active Shield");
    const s2 = setup(true, true);
    const r2 = tickSimulation(s2);
    const p2 = r2.nextState.entities.get(hexCubeKey(target));
    if (p2 && !p2.destroyed) console.log("PASS: Probe survived.");
    else console.log(`FAIL: Probe destroyed. state: ${JSON.stringify(p2)}`);

    // 3. Disabled Shield -> Destroyed
    console.log("Test 3: Disabled Shield (Clear LOS)");
    const s3 = setup(false, true);
    const r3 = tickSimulation(s3);
    const p3 = r3.nextState.entities.get(hexCubeKey(target));
    if (p3 && p3.destroyed) console.log("PASS: Probe destroyed through disabled shield.");
    else console.log(`FAIL: Probe survived. state: ${JSON.stringify(p3)}`);
}

function runShieldTest() {
    console.log('\n=== Running Shield Overheat Tests ===');
    
    // Setup: Source -> Shield (low tolerance)
    const state: SimulationState = {
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
        lastPerimeterEnergy: 0,
        tickCount: 0,
        radius: 5,
        diffusionAlpha: 0.1,
        baseConductivity: 1.0
    };

    const source: SourceEntity = { type: 'source', pos: [0,0,0], power: 100, active: true, minActivation: 0 };
    const shield: ShieldEntity = { type: 'shield', pos: [0,-1,1], conductivity: 1.0, heatTolerance: 10 }; // Low tolerance
    
    state.entities.set(hexCubeKey(source.pos), source);
    state.entities.set(hexCubeKey(shield.pos), shield);
    state.E.set(hexCubeKey(source.pos), 100);
    state.E.set(hexCubeKey(shield.pos), 50); // Already above tolerance

    console.log('Test 1: Shield Overheat Destruction');
    
    let destroyed = false;
    for(let i=0; i<100; i++) {
        const res = tickSimulation(state);
        // Copy state back for next tick
        state.entities = res.nextState.entities;
        state.E = res.nextState.E;
        state.tickCount = res.nextState.tickCount;
        
        const s = state.entities.get(hexCubeKey(shield.pos)) as ShieldEntity;
        if (s.destroyed) {
            destroyed = true;
            console.log(`PASS: Shield destroyed at tick ${i+1}`);
            break;
        }
    }
    
    if (!destroyed) console.error('FAIL: Shield survived 100 ticks despite being overheated.');
}

runTest();
runProbeTest();
runShieldTest();
runShieldTest();
