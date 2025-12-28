
import { tickSimulation, type SimulationState, type ProbeEntity } from './hex_tick';
import { hexCubeKey } from '../lib/hexlib';

function runProbeHeatTest() {
    console.log('\n=== Running Probe Heat Tolerance Tests ===');
    
    // Setup
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

    const probe: ProbeEntity = { 
        type: 'probe', 
        pos: [0,0,0], 
        heatTolerance: 10 // Low tolerance
    };
    
    const key = hexCubeKey(probe.pos);
    state.entities.set(key, probe);
    state.E.set(key, 50); // Heat = 50 > 10
    
    console.log('Test 1: Probe Overheat Destruction');
    
    let destroyed = false;
    for(let i=0; i<100; i++) {
        // Enforce heat every tick (in case of diffusion)
        state.E.set(key, 50);
        
        const res = tickSimulation(state);
        // Update
        state.entities = res.nextState.entities;
        state.E = res.nextState.E;
        
        const p = state.entities.get(key) as ProbeEntity;
        
        if (p.destroyed) {
            destroyed = true;
            console.log(`PASS: Probe destroyed at tick ${i+1}`);
            break;
        }
    }
    
    if (!destroyed) console.error('FAIL: Probe survived 100 ticks despite being overheated.');
}

runProbeHeatTest();
