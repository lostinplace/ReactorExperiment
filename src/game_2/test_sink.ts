
import { tickSimulation, type SimulationState, type SinkEntity } from './hex_tick';
import { hexCubeKey } from '../lib/hexlib';

function runSinkOverheatTest() {
    console.log('\n=== Running Sink Overheat Tests ===');
    
    // Setup: Sink with 100 heat, tolerance 10
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

    const sink: SinkEntity = { 
        type: 'sink', 
        pos: [0,0,0], 
        pullRate: 1.0, // High pull
        conductivity: 1.0, 
        heatTolerance: 10,
        groupId: 1
    };
    
    const key = hexCubeKey(sink.pos);
    state.entities.set(key, sink);
    state.E.set(key, 50); // Above tolerance
    
    // Add a reservoir for it to pull to (so we can check if it stopped pulling)
    // Heat 50000 / Volume 1000 = Temp 50.
    state.reservoirs.set(1, { id: 1, heat: 50000, volume: 1000, radiator: { deployed: false, strength: 0 } });

    console.log('Test 1: Sink Overheat Destruction');
    
    let destroyed = false;
    for(let i=0; i<100; i++) {
        const res = tickSimulation(state);
        // Update state
        state.entities = res.nextState.entities;
        state.E = res.nextState.E;
        state.reservoirs = res.nextState.reservoirs; // Important to track reservoir
        
        const s = state.entities.get(key) as SinkEntity;
        
        if (s.destroyed) {
            destroyed = true;
            console.log(`PASS: Sink destroyed at tick ${i+1}`);
            
            // Verify it stopped pulling energy
            // Next tick, reservoir should NOT increase if sink is dead.
            // (Assuming no other sources)
            const rBefore = state.reservoirs.get(1)?.heat ?? 0;
            // Refill sink cell to have something to pull
            state.E.set(key, 50); 
            
            const res2 = tickSimulation(state);
            const rAfter = res2.nextState.reservoirs.get(1)?.heat ?? 0;
            
            if (Math.abs(rAfter - rBefore) < 0.001) {
                console.log("PASS: Destroyed sink stopped pulling energy.");
            } else {
                console.error(`FAIL: Destroyed sink pulled energy! ${rBefore} -> ${rAfter}`);
            }
            
            break;
        }
    }
    
    if (!destroyed) console.error('FAIL: Sink survived 100 ticks despite being overheated.');
}

runSinkOverheatTest();
