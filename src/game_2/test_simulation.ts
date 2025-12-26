
import { tickThermo, type HexMapE, type Source, type Shield, type Sink } from './hex_tick';
import { cubeKey, generateHexagon } from '../lib/hexlib';

function runTest() {
    console.log("=== Running Thermo Simulation Tests ===");

    // Setup: 1 central cell (100 heat) + 6 neighbors (0 heat)
    const center = [0, 0, 0] as const;
    const coords = generateHexagon(1); // ring 1 (1 + 6 = 7 cells)
    const E: HexMapE = new Map();
    for (const c of coords) E.set(cubeKey(c), 0);
    
    // Inject heat at center
    E.set(cubeKey(center), 100);

    console.log(`Initial E(center): ${E.get(cubeKey(center))}`);

    // --- Scenario 1: Alpha 0.9 (User's value) ---
    console.log("\n--- Scenario 1: Unstable Alpha (0.9) ---");
    const res1 = tickThermo(E, [], [], [], { diffusionAlpha: 0.9 });
    const e1 = res1.E.get(cubeKey(center)) ?? 0;
    console.log(`Tick 1 E(center): ${e1}`);
    
    if (e1 < 0) {
        console.log("FAIL: Center energy went negative! Instability detected.");
    } else {
        console.log("PASS?? (Unexpected)");
    }

    // --- Scenario 2: Alpha 0.1 (Stable value) ---
    console.log("\n--- Scenario 2: Stable Alpha (0.1) ---");
    const res2 = tickThermo(E, [], [], [], { diffusionAlpha: 0.1 });
    const e2 = res2.E.get(cubeKey(center)) ?? 0;
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
    const res3 = tickThermo(E, [], [], []);
    const e3 = res3.E.get(cubeKey(center)) ?? 0;
    console.log(`Tick 1 E(center): ${e3}`);
    
    if (e3 > 0 && e3 < 100) {
        console.log("PASS: Default alpha produced stable result.");
    } else {
        console.log("FAIL: Default alpha unstable.");
    }
}

runTest();
