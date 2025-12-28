
import { ThermoGame } from './game';
import { hexCubeKey } from '../lib/hexlib';

function runRetainedEnergyTest() {
    console.log("=== Running Retained Energy Tests ===");

    // 1. Setup Game
    const game = new ThermoGame();
    // Reset defaults for clean slate
    game.state.entities.clear();
    game.state.E.clear();

    const shieldPos = [0, 0, 0] as const;
    const key = hexCubeKey(shieldPos);

    // Place Shield
    game.setEntity(key, 'shield');
    const shield = game.state.entities.get(key) as any;
    shield.groupId = 2; // Use group 2

    // Set Initial Energy
    game.state.E.set(key, 100);
    console.log(`Initial E: ${game.state.E.get(key)}`);

    // 2. Disable Shield -> Should store E and zero cell
    console.log("Action: Disable Group 2");
    game.toggleShieldGroup(2);

    const eAfterDisable = game.state.E.get(key);
    const retained = shield.retainedE;

    if (eAfterDisable === 0 &&(Math.abs(retained - 100) < 0.001)) {
        console.log("PASS: Energy retained (100) and cell zeroed.");
    } else {
        console.error(`FAIL: E=${eAfterDisable}, retained=${retained}`);
    }

    // 3. Simulate "Diffusion" (change cell E while disabled)
    // Even if we don't tick, let's say some tiny heat got in or we just ensure 0 stays 0.
    // Let's manually set E to 5 (e.g. diffusion from neighbor)
    game.state.E.set(key, 5);
    console.log("Simulated diffusion: Cell E is now 5");

    // 4. Enable Shield -> Should restore retained E, overwriting 5
    console.log("Action: Enable Group 2");
    game.toggleShieldGroup(2);

    const eAfterEnable = game.state.E.get(key) ?? -1;
    const retainedAfter = shield.retainedE;

    if (Math.abs(eAfterEnable - 100) < 0.001 && retainedAfter === undefined) {
        console.log("PASS: Energy restored (100).");
    } else {
        console.error(`FAIL: E=${eAfterEnable}, retained=${retainedAfter}`);
    }
}

runRetainedEnergyTest();
