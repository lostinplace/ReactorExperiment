import './style.css'
import MinesweeperGame, { GameState } from './game_1/minesweeper_game.ts'
import type { Layout } from './lib/hexlib'
import { mapGameToHexGrid, getMinesweeperStyle } from './game_1/render.ts'
import { HexGrid } from './ui/hex_grid'
import GameConfig from './game_1/config.ts'

let currentGame: MinesweeperGame;

const mapRadius = 5;
const mineCount = 15;
const hexSize = 30;

// Get seed from URL or random
const urlParams = new URLSearchParams(window.location.search);
let currentSeed = urlParams.get('seed') || Math.random().toString(36).substring(7);

function initGame(seed: string, exponentBase: number) {
    const config = new GameConfig(mapRadius, mineCount, exponentBase, seed);
    const game = new MinesweeperGame(config);
    currentGame = game;
    // Layout object literal
    const layout: Layout = {
        size: { x: hexSize, y: hexSize },
        origin: { x: 0, y: 0 },
        orientation: 'pointy'
    };
    
    const boardEl = document.getElementById('game-board')!;
    
    // Switch to new Generic HexGrid
    const hexGrid = new HexGrid(boardEl, layout);

    const renderGame = () => {
        const map = mapGameToHexGrid(game);
        hexGrid.render(map, {
            styleFn: getMinesweeperStyle
        });
    };

    hexGrid.onCellClick = (h) => {
        game.reveal(h);
        renderGame();
        checkGameState(game);
    };

    hexGrid.onCellRightClick = (h) => {
        game.toggleFlag(h);
        renderGame();
    };

    // Update URL without reloading
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('seed', seed);
    window.history.replaceState({}, '', newUrl);

    // Update Input
    const seedInput = document.getElementById('seed-input') as HTMLInputElement;
    if (seedInput) seedInput.value = seed;

    if (timerInterval) cancelAnimationFrame(timerInterval);
    updateHUD(game); // Reset HUD

    game.onGameStart = () => {
         updateHUD(game);
    };

    // Reset lock button state
    const lockBtn = document.getElementById('lock-btn') as HTMLButtonElement;
    if (lockBtn) {
        lockBtn.textContent = "LOCK";
        lockBtn.disabled = false;
        lockBtn.style.background = "#fab387";
        lockBtn.style.cursor = "pointer";
    }

    game.onMineRevealed = (h) => {
        // Optional: Visual feedback for mine hit
        console.log("Mine hit! Resetting area around", h);
        renderGame();
        // Maybe shake screen?
        document.body.style.transform = "translateX(5px)";
        setTimeout(() => document.body.style.transform = "translateX(0)", 50);
    };

    renderGame();

    // Flag List Logic
    const flagListEl = document.getElementById('flag-list-content')!;
    const updateFlagList = () => {
        flagListEl.innerHTML = '';
        // Sort by time
        const flags = Array.from(game.runState.flagEvents.entries()).sort((a, b) => a[1] - b[1]);
        
        flags.forEach(([key, timestamp]) => {
            const timeOffset = (timestamp - (game.runState.startTime || 0)) / 1000;
            const div = document.createElement('div');
            div.className = 'flag-item';
            div.innerHTML = `<span>${key}</span><span>${timeOffset.toFixed(2)}s</span>`;
            flagListEl.appendChild(div);
        });
    };

    game.onFlagStateChange = () => {
        updateFlagList();
    };
    
    // Initial clear
    flagListEl.innerHTML = '';
}

function checkGameState(game: MinesweeperGame) {
    if (game.state === GameState.WON) { 
        setTimeout(() => alert("You Won!"), 100);
    } else if (game.state === GameState.LOST) { 
        setTimeout(() => alert("Game Over!"), 100);
    }
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="flag-list">
      <h3>FLAGS</h3>
      <div id="flag-list-content"></div>
  </div>

  <div id="status-bar">
    <div class="status-item">
        <span>Seed:</span>
        <input type="text" id="seed-input" value="${currentSeed}" style="width: 80px; background: rgba(0,0,0,0.2); border: 1px solid #666; color: white; padding: 2px;">
        <button id="new-seed-btn" title="Random Seed">🎲</button>
    </div>
    <div class="status-item">
        <span>Mines: ${mineCount}</span>
        <button id="reset-btn">Reset</button>
    </div>
    <div class="status-item">
        <span>Exp Range:</span>
        <input type="number" id="exponent-input" value="1.0" step="0.1" min="0.1" style="width: 50px; background: rgba(0,0,0,0.2); border: 1px solid #666; color: white; padding: 2px;">
        <button id="lock-btn" style="background: #fab387; color: #1e1e2e; font-weight: bold; margin-left: 10px;">LOCK</button>
    </div>
  </div>
  
  <div id="stats-hud">
    <h3>STATS</h3>
    <div class="stat-row">
        <span>TIME:</span>
        <span id="hud-time">0.0s</span>
    </div>
    <div class="stat-row">
        <span>POWER:</span>
        <span id="hud-power">0.00</span>
    </div>
    <div class="stat-row">
        <span>PWR/MIN:</span>
        <span id="hud-power-min">0.00</span>
    </div>
    <hr style="border-color: #45475a; margin: 5px 0;">
    <div class="stat-row">
        <span>HEAT:</span>
        <span id="hud-heat">0.00</span>
    </div>
    <div class="stat-row">
        <span>HEAT/MIN:</span>
        <span id="hud-heat-min">0.00</span>
    </div>
     <hr style="border-color: #45475a; margin: 5px 0;">
    <div class="stat-row">
        <span>EXPONENT:</span>
        <span id="hud-exponent">1.00</span>
    </div>
  </div>

  <div id="game-container">
    <div id="game-board"></div>
  </div>
`;

// Styles for status bar
const style = document.createElement('style');
style.textContent = `
    #status-bar {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        display: flex;
        gap: 20px;
        background: rgba(30, 30, 46, 0.9);
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #45475a;
    }
    .status-item {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    button {
        background: #45475a;
        color: #cdd6f4;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
    }
    button:hover {
        background: #585b70;
    }

    #stats-hud {
        position: absolute;
        top: 100px;
        right: 20px;
        width: 200px;
        background: rgba(30, 30, 46, 0.9);
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #fab387;
        color: #cdd6f4;
        font-family: monospace;
        z-index: 100;
        pointer-events: none; /* Let clicks pass through if needed, though likely not overlapping grid much */
    }
    #stats-hud h3 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 1.2em;
        color: #fab387;
        text-align: center;
        border-bottom: 1px solid #45475a;
        padding-bottom: 5px;
    }
    .stat-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-size: 0.9em;
    }

    #flag-list {
        position: absolute;
        top: 100px;
        left: 20px;
        width: 150px;
        background: rgba(30, 30, 46, 0.9);
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #fab387;
        color: #cdd6f4;
        font-family: monospace;
        z-index: 100;
        max-height: 400px;
        overflow-y: auto;
    }
    #flag-list h3 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 1.2em;
        color: #fab387;
        text-align: center;
        border-bottom: 1px solid #45475a;
        padding-bottom: 5px;
    }
    .flag-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.85em;
        margin-bottom: 2px;
        color: #a6ADC8;
    }
`;
document.head.appendChild(style);

let timerInterval: number;
const hudTime = document.getElementById('hud-time')!;
const hudPower = document.getElementById('hud-power')!;
const hudPowerMin = document.getElementById('hud-power-min')!;
const hudHeat = document.getElementById('hud-heat')!;
const hudHeatMin = document.getElementById('hud-heat-min')!;
const hudExponent = document.getElementById('hud-exponent')!;

function updateHUD(game: MinesweeperGame) {
    if (game.runState.startTime) {
        const stats = game.calculateStats();
        if (stats) {
            hudTime.innerText = stats.timeSeconds.toFixed(1) + 's';
            hudPower.innerText = stats.rawPower.toFixed(2);
            hudPowerMin.innerText = stats.powerPerMin.toFixed(2);
            hudHeat.innerText = stats.rawHeat.toFixed(2);
            hudHeatMin.innerText = stats.heatPerMin.toFixed(2);
            hudExponent.innerText = stats.currentExponent!.toFixed(3);
        }
    } else {
        hudTime.innerText = '0.0s';
        hudPower.innerText = '0.00';
        hudPowerMin.innerText = '0.00';
        hudHeat.innerText = '0.00';
        hudHeatMin.innerText = '0.00';
        hudExponent.innerText = '1.000';
    }

    if (game.state === 0) { // Playing
        timerInterval = requestAnimationFrame(() => updateHUD(game));
    }
}

initGame(currentSeed, 1.0);

document.getElementById('seed-input')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLInputElement).value;
    if (val) {
        currentSeed = val;
        const exp = parseFloat((document.getElementById('exponent-input') as HTMLInputElement).value) || 1.0;
        initGame(currentSeed, exp);
    }
});

document.getElementById('exponent-input')?.addEventListener('change', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value) || 1.0;
    initGame(currentSeed, val);
});

// Refactoring to store current game

function setupGlobalListeners() {
    document.getElementById('reset-btn')?.addEventListener('click', () => {
         const exp = parseFloat((document.getElementById('exponent-input') as HTMLInputElement).value) || 1.0;
         if (currentGame) initGame(currentSeed, exp);
    });

    document.getElementById('new-seed-btn')?.addEventListener('click', () => {
        currentSeed = Math.random().toString(36).substring(7);
        const exp = parseFloat((document.getElementById('exponent-input') as HTMLInputElement).value) || 1.0;
        initGame(currentSeed, exp);
    });

    document.getElementById('seed-input')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (val) {
            currentSeed = val;
            const exp = parseFloat((document.getElementById('exponent-input') as HTMLInputElement).value) || 1.0;
            initGame(currentSeed, exp);
        }
    });

    document.getElementById('lock-btn')?.addEventListener('click', (e) => {
        if (!currentGame || currentGame.state !== 0) return;
        
        // Lock the game
        currentGame.lockGame();
        
        // Visual feedback
        const btn = e.target as HTMLButtonElement;
        btn.textContent = "LOCKED";
        btn.disabled = true;
        btn.style.background = "#585b70";
        btn.style.cursor = "not-allowed";

        // Stop the HUD update loop (it checks for state === 0)
        // One final update to ensure exact lock time is shown
        updateHUD(currentGame);
    });
}
setupGlobalListeners();
