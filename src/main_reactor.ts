import './style.css';
import { ThermoGame } from './game_2/game';
import { type SinkEntity, type SourceEntity, type ShieldEntity, type ProbeEntity } from './game_2/hex_tick';
import { getThermoStyle, mapThermoToHexGrid } from './game_2/render';
import { HexGrid } from './ui/hex_grid';
import { hexCubeKey, type HexCubeKey, generateHexagon, type Layout } from './lib/hexlib';
import defaultLayout from './game_2/config/reactor_layout.json';

// ============================================================
// DOM helpers
// ============================================================

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ============================================================
// App Layout
// ============================================================

function mountLayout(app: HTMLElement) {
  app.innerHTML = `
  <div id="reactor-layout" style="display:flex; width:100vw; height:100vh; overflow:hidden; margin:0; padding:0;">
    <!-- LEFT SIDEBAR: GAMEPLAY -->
    <div id="reactor-sidebar-left" style="width:300px; background:#222; color:#eee; display:flex; flex-direction:column; align-items:flex-start; padding:10px; border-right:1px solid #444; z-index:10; box-sizing:border-box; overflow-y:auto;">
      <h2 style="margin-top:0;">Reactor Control</h2>

      <div class="panel-section" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="btn-play-pause">Play</button>
        <button id="btn-step">Step</button>
        <button id="btn-step-5">+5</button>
        <button id="btn-quench" style="background:#44a; color:white;">Quench</button>
      </div>

      <div style="margin:10px 0; font-size: 0.9em; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; justify-content:space-between;">
           <span>Tick: <span id="tick-count">0</span></span>
           <span style="color:#aaa;">Time: <span id="tick-time">0.00</span>ms</span>
        </div>
        
        <div style="border-top:1px solid #444; padding-top:5px; margin-top:5px;">
           <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
             <span style="color:#aaa;">Tick Budget</span>
             <span id="lbl-tick-budget" style="color:#fff;">100ms</span>
           </div>
           <input id="inp-tick-budget" type="range" min="0" max="1000" value="100" step="10" style="width:100%; cursor:pointer;">
        </div>
      </div>

       <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">SOURCE CONTROLS</div>
      <div id="source-controls" style="margin-bottom:10px; width:100%;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">SHIELD CONTROLS</div>
      <div id="shield-controls" style="margin-bottom:10px; width:100%;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">RESERVOIRS</div>
      <div id="reservoir-controls" style="margin-bottom:10px; width:100%;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">CAPACITOR BANKS & PROBES</div>
      <div id="capacitor-controls" style="margin-bottom:10px; width:100%;"></div>
    </div>

    <!-- MAIN VIEW -->
    <div id="reactor-main" style="flex:1; position:relative; background:#111; overflow:hidden;">
      <div id="game-board" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
      
      <!-- HUD -->
      <div style="position:absolute; top:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.6); padding:5px 15px; border-radius:15px; border:1px solid #444; color:#fff; font-family:monospace; pointer-events:none;">
        PERIMETER EXPOSURE: <span id="val-perimeter" style="font-weight:bold; color:#f88;">0.00</span>
      </div>

      <!-- INSTRUCTIONS LEGEND -->
      <div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); padding:10px; border-radius:8px; border:1px solid #444; color:#ccc; font-size:0.85em; font-family:sans-serif; pointer-events:none; max-width:280px; z-index:20;">
        <div style="font-weight:bold; color:#fff; margin-bottom:5px; border-bottom:1px solid #555; padding-bottom:3px;">Mechanics & Controls</div>
        <ul style="margin:0; padding-left:16px; list-style-type:square; line-height:1.4em;">
           <li><b>Source Throttle (Left):</b> Increases output.</li>
           <li><b>Probes:</b> Destroyed by direct source exposure (LOS).</li>
           <li><b>Grouping:</b> Hover entity + Press <b>1-6</b>.</li>
           <li><b>Shields:</b> Toggle via control buttons.</li>
        </ul>
      </div>
    </div>

    <!-- RIGHT SIDEBAR: EDITOR -->
    <div id="reactor-sidebar-right" style="width:280px; background:#222; color:#eee; display:flex; flex-direction:column; align-items:flex-start; padding:10px; border-left:1px solid #444; z-index:10; box-sizing:border-box;">
      <h2 style="margin-top:0;">Construction</h2>

      <div class="panel-section" style="display:flex; gap:8px; margin-bottom:10px; width:100%;">
        <button id="btn-save" style="flex:1; background:#444;">Save</button>
        <button id="btn-load" style="flex:1; background:#444;">Load</button>
        <button id="btn-clear" style="flex:1; background:#622;">Clear</button>
      </div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">TOOLS</div>
      <div class="panel-section" id="palette-toolbar" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">ENTITY LIST</div>
      <div id="entity-list" style="flex:1; overflow-y:auto; font-size:14px; width:100%;"></div>
    </div>
  </div>
  `;
}

// ============================================================
// Types / State
// ============================================================

type ToolType = 'select' | 'source' | 'sink' | 'shield' | 'probe' | 'erase';

type SidebarSignature = {
  selectedKey: HexCubeKey | null;
  entityType: string; // 'empty' | entity.type
};

type AppState = {
  isPlaying: boolean;
  rafId: number | null;

  activeTool: ToolType;
  selectedKey: HexCubeKey | null;

  // For drag painting
  isPointerDown: boolean;
  hoveredKey: HexCubeKey | null;

  // Sidebar rebuild heuristics
  lastSidebarSig: SidebarSignature;

  // Time control
  tickBudgetMs: number;
  lastTickTime: number;
  lastTickDuration: number;
};

// ============================================================
// Game + Grid Init
// ============================================================

function createGameAndGrid() {
  const radius = 8;
  const cubes = generateHexagon(radius);
  const keys = cubes.map(c => hexCubeKey(c));
  const game = new ThermoGame(keys);

  // Sidebars: Left=300px, Right=280px. Total=580px.
  // We want the origin relative to the "game-board" container which fills the remaining space.
  const centerX = (window.innerWidth - 580) / 2;
  const centerY = window.innerHeight / 2;

  const layout: Layout = {
    size: { x: 30, y: 30 },
    origin: { x: centerX, y: centerY },
    orientation: 'pointy'
  };

  const boardEl = mustGetEl<HTMLDivElement>('game-board');
  const hexGrid = new HexGrid(boardEl, layout);

  return { game, hexGrid, layout };
}

// ============================================================
// Rendering
// ============================================================

function getTempColor(t: number): string {
  if (t < 50) return '#aaf';
  if (t < 150) return '#fff';
  return '#f88';
}

function renderFrame(game: ThermoGame, hexGrid: HexGrid, state: AppState) {
  const map = mapThermoToHexGrid(game);
  hexGrid.render(map, { styleFn: getThermoStyle });

  setText('tick-count', String(game.state.tickCount));
  setText('tick-time', state.lastTickDuration.toFixed(2));
  setText('val-perimeter', game.state.lastPerimeterEnergy.toFixed(2));

  // Sidebar: rebuild structure only when necessary
  // We need to pass a "requestRender" function to updateSidebar so it can be passed to click handlers
  // effectively closing the loop.
  const triggerRender = () => renderFrame(game, hexGrid, state);
  updateSidebar(game, state, triggerRender);

  // Probe totals: targeted updates
  for (const id of [1, 2, 3, 4]) {
    const lbl = document.getElementById(`lbl-probe-total-${id}`);
    if (lbl) lbl.textContent = (game.state.totalEnergyCollected.get(id) ?? 0).toFixed(1);

    const rateLbl = document.getElementById(`lbl-probe-rate-${id}`);
    if (rateLbl) {
        const rate = (game.state.lastTickEnergy.get(id) ?? 0).toFixed(2);
        rateLbl.textContent = `+${rate}/t`;
    }
  }

  updateCapacitorUI(game);
  updateReservoirUI(game); // New Reservoir update
  updateSourceList(game); 
  for (const id of [1, 2, 3, 4]) {
    // Total -> Capacitor Stored
    const lbl = document.getElementById(`lbl-probe-total-${id}`);
    const cap = game.state.capacitors.get(id);
    if (lbl && cap) lbl.textContent = (cap.stored).toFixed(0);

    // Rate -> Capacitor Delta
    const rateLbl = document.getElementById(`lbl-probe-rate-${id}`);
    if (rateLbl) {
        // Delta
        const delta = (game.state.lastCapacitorDelta.get(id) ?? 0);
        const sign = delta >= 0 ? '+' : '';
        rateLbl.textContent = `${sign}${delta.toFixed(2)}/t`;
        
        // Color code delta
        rateLbl.style.color = delta > 0 ? '#8f8' : (delta < 0 ? '#f88' : '#aaa');
    }
  }
}

// ============================================================
// Sidebar
// ============================================================

function computeSidebarSig(game: ThermoGame, selectedKey: HexCubeKey | null): SidebarSignature {
  const ent = selectedKey ? game.state.entities.get(selectedKey) : undefined;
  return {
    selectedKey,
    entityType: ent ? ent.type : 'empty'
  };
}

function updateSidebar(game: ThermoGame, state: AppState, requestRender: () => void) {
  const sig = computeSidebarSig(game, state.selectedKey);
  const same =
    sig.selectedKey === state.lastSidebarSig.selectedKey &&
    sig.entityType === state.lastSidebarSig.entityType;

  if (!same) {
    rebuildSidebar(game, state, requestRender);
    state.lastSidebarSig = sig;
  }

  // Always update numeric values (temp, inputs, selected row summary)
  updateSidebarValues(game, state.selectedKey);
}

function rebuildSidebar(game: ThermoGame, state: AppState, requestRender: () => void) {
  const list = mustGetEl<HTMLDivElement>('entity-list');
  list.innerHTML = '';

  // Selected Cell Detail
  if (state.selectedKey) {
    const ent = game.state.entities.get(state.selectedKey);

    const detail = document.createElement('div');
    detail.id = 'sidebar-detail-panel';
    detail.style.background = '#333';
    detail.style.padding = '10px';
    detail.style.borderLeft = ent ? '4px solid #f88' : '4px solid #555';
    detail.style.marginBottom = '15px';

    detail.innerHTML = `
      <div style="font-size:1.1em; font-weight:bold;">
        ${ent ? ent.type.toUpperCase() : 'EMPTY SPACE'}
      </div>
      <div style="font-family:monospace; color:#aaa; margin-bottom:5px;">${state.selectedKey}</div>
      <div style="margin-bottom:8px;">
        Temp: <strong id="val-temp" style="color:#fff">--</strong>
      </div>
    `;

    if (ent) {
      detail.appendChild(document.createElement('hr'));

      if (ent.type === 'source') {
        const s = ent as SourceEntity;
        detail.appendChild(createNumInput('Power', s.power, v => (s.power = v), 1, 'inp-power'));
        detail.appendChild(createNumInput('Min Active', s.minActivation, v => (s.minActivation = v), 1, 'inp-minactive'));

        detail.appendChild(
          createNumInput(
            'Group ID',
            s.groupId ?? 1,
            v => {
              s.groupId = clampInt(v, 1, 4);
            },
            1,
            'inp-group'
          )
        );

        const btn = document.createElement('button');
        btn.id = 'btn-active-toggle';
        btn.style.marginTop = '5px';
        btn.style.width = '100%';
        btn.onclick = () => {
          s.active = !s.active;
        };
        detail.appendChild(btn);
      }

      if (ent.type === 'sink') {
        const s = ent as SinkEntity;
        detail.appendChild(createNumInput('Pull Rate', s.pullRate, v => (s.pullRate = Math.min(1, Math.max(0, v))), 0.01, 'inp-pull'));
        detail.appendChild(createNumInput('Conductivity', s.conductivity, v => (s.conductivity = v), 0.1, 'inp-cond'));
        detail.appendChild(createNumInput('Tolerance', s.heatTolerance ?? 1400, v => (s.heatTolerance = v), 100, 'inp-tol'));
        
        detail.appendChild(
          createNumInput(
            'Group ID',
            s.groupId ?? 1,
            v => {
              s.groupId = clampInt(v, 1, 6);
            },
            1,
            'inp-sink-group'
          )
        );

        // Display connected Reservoir status briefly? 
        // Or just let user look at sidebar.
        const r = game.state.reservoirs.get(s.groupId ?? 1);
        if (r) {
             const info = document.createElement('div');
             info.style.marginTop = '5px';
             info.style.color = '#aaa';
             info.textContent = `Feeds Reservoir ${r.id} (${(r.heat / r.volume).toFixed(0)}°)`;
             detail.appendChild(info);
        }
      }

      if (ent.type === 'shield') {
        const s = ent as ShieldEntity;
        detail.appendChild(createNumInput('Conductivity', s.conductivity, v => (s.conductivity = v), 0.01, 'inp-cond'));
        detail.appendChild(createNumInput('Tolerance', s.heatTolerance ?? 2000, v => (s.heatTolerance = v), 10, 'inp-tol'));
        detail.appendChild(
          createNumInput(
            'Group ID',
            s.groupId ?? 1,
            v => {
              s.groupId = clampInt(v, 1, 4);
            },
            1,
            'inp-shield-group'
          )
        );
      }

      if (ent.type === 'probe') {
        const p = ent as ProbeEntity;
        if (p.groupId === undefined) p.groupId = 1;

        detail.appendChild(createNumInput('Tolerance', p.heatTolerance ?? 1800, v => (p.heatTolerance = v), 100, 'inp-tol'));

        detail.appendChild(
          createNumInput(
            'Group ID',
            p.groupId,
            v => {
              p.groupId = clampInt(v, 1, 4);
            },
            1,
            'inp-probe-group'
          )
        );

        const note = document.createElement('div');
        note.style.color = '#aaa';
        note.style.fontStyle = 'italic';
        note.style.marginTop = '5px';
        note.textContent = 'Collects energy based on group delta E.';
        detail.appendChild(note);
      }
    } else {
      detail.innerHTML += `<div style="color:#aaa; font-size:0.9em;">Select a tool to place a component.</div>`;
    }

    list.appendChild(detail);
  } else {
    const hint = document.createElement('div');
    hint.style.padding = '10px';
    hint.style.color = '#777';
    hint.textContent = 'Select a cell to view details.';
    list.appendChild(hint);
  }

  // Entity directory
  renderEntityList(game, state, list, requestRender);
}

function updateSidebarValues(game: ThermoGame, selectedKey: HexCubeKey | null) {
  if (!selectedKey) return;

  const temp = game.state.E.get(selectedKey) ?? 0;
  const ent = game.state.entities.get(selectedKey);

  const tempEl = document.getElementById('val-temp');
  if (tempEl) {
    tempEl.textContent = temp.toFixed(5);
    (tempEl as HTMLElement).style.color = getTempColor(temp);
  }

  if (!ent) return;

  const updateInputIfNotFocused = (id: string, val: number) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && document.activeElement !== el) el.value = String(val);
  };
// ...
  if (ent.type === 'source') {
    const s = ent as SourceEntity;
    updateInputIfNotFocused('inp-power', s.power);
    updateInputIfNotFocused('inp-minactive', s.minActivation);
    updateInputIfNotFocused('inp-group', s.groupId ?? 1);

    const btn = document.getElementById('btn-active-toggle') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = s.active ? 'ACTIVE' : 'INACTIVE';
      btn.style.background = s.active ? '#2b2' : '#b22';
    }
  }

  if (ent.type === 'sink') {
    const s = ent as SinkEntity;
    updateInputIfNotFocused('inp-cond', s.conductivity);
    updateInputIfNotFocused('inp-pull', s.pullRate);
    updateInputIfNotFocused('inp-tol', s.heatTolerance ?? 1400);
    updateInputIfNotFocused('inp-sink-group', s.groupId ?? 1);
  }

  if (ent.type === 'shield') {
    updateInputIfNotFocused('inp-cond', (ent as ShieldEntity).conductivity);
    updateInputIfNotFocused('inp-tol', (ent as ShieldEntity).heatTolerance ?? 2000);
    updateInputIfNotFocused('inp-shield-group', (ent as ShieldEntity).groupId ?? 1);
  }

  if (ent.type === 'probe') {
    const p = ent as ProbeEntity;
    updateInputIfNotFocused('inp-tol', p.heatTolerance ?? 1800);
    if (p.groupId === undefined) p.groupId = 1;
    updateInputIfNotFocused('inp-probe-group', p.groupId);
  }

  // Update list row summary for selected item
  const sumEl = document.getElementById(`list-sum-${selectedKey}`);
  if (sumEl) {
    sumEl.textContent = summarizeEntity(ent);
  }
}

function renderEntityList(game: ThermoGame, state: AppState, list: HTMLElement, requestRender: () => void) {
  const groups: Record<'source' | 'sink' | 'shield' | 'probe', Array<{ key: HexCubeKey; entity: any }>> = {
    source: [],
    sink: [],
    shield: [],
    probe: []
  };

  for (const [k, e] of game.state.entities) {
    const t = e.type as keyof typeof groups;
    if (groups[t]) groups[t].push({ key: k, entity: e });
  }

  const renderGroup = (title: string, items: Array<{ key: HexCubeKey; entity: any }>) => {
    if (items.length === 0) return;

    const header = document.createElement('div');
    header.textContent = title.toUpperCase();
    header.style.fontSize = '0.85em';
    header.style.color = '#888';
    header.style.marginTop = '10px';
    header.style.borderBottom = '1px solid #444';
    list.appendChild(header);

    for (const item of items) {
      const row = document.createElement('div');
      row.style.padding = '4px 8px';
      row.style.cursor = 'pointer';
      row.style.fontSize = '0.9em';
      row.style.borderBottom = '1px solid #333';
      if (item.key === state.selectedKey) row.style.background = '#444';

      row.onclick = () => {
        state.selectedKey = item.key;
        requestRender();
      };

      row.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <span>${item.key}</span>
          <span id="list-sum-${item.key}" style="color:#aaa;">${summarizeEntity(item.entity)}</span>
        </div>
      `;

      list.appendChild(row);
    }
  };

  renderGroup('Sources', groups.source);
  renderGroup('Sinks', groups.sink);
  renderGroup('Shields', groups.shield);
  renderGroup('Probes', groups.probe);
}

function summarizeEntity(ent: any): string {
  if (!ent) return '';
  if (ent.type === 'source') return `G${ent.groupId} • Pwr: ${ent.power}`;
  if (ent.type === 'sink') return `G${ent.groupId} • Pull: ${ent.pullRate}`;
  if (ent.type === 'shield') return `G${ent.groupId} • Cond: ${ent.conductivity}`;
  if (ent.type === 'probe') return `G${ent.groupId}`;
  return '';
}

// ============================================================
// UI building blocks
// ============================================================

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function createNumInput(
  label: string,
  val: number,
  onChange: (v: number) => void,
  step = 1,
  id?: string
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '4px';
  wrap.style.display = 'flex';
  wrap.style.justifyContent = 'space-between';
  wrap.style.alignItems = 'center';

  const lbl = document.createElement('span');
  lbl.style.fontSize = '0.9em';
  lbl.style.color = '#ccc';
  lbl.textContent = label;

  const inp = document.createElement('input');
  if (id) inp.id = id;
  inp.type = 'number';
  inp.value = String(val);
  inp.style.width = '70px';
  inp.style.background = '#222';
  inp.style.color = '#fff';
  inp.style.border = '1px solid #555';
  inp.style.padding = '2px';
  inp.step = String(step);

  const handler = () => {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v)) return;
    onChange(v);
  };

  // Prefer change for “commit”, but keep input for immediate feedback
  inp.addEventListener('change', handler);
  inp.addEventListener('input', handler);

  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  return wrap;
}

// ============================================================
// Palette + Controls
// ============================================================

function initPalette(state: AppState) {
  const toolbar = mustGetEl<HTMLDivElement>('palette-toolbar');
  const tools: Array<{ id: ToolType; label: string; color?: string }> = [
    { id: 'select', label: 'Select' },
    { id: 'source', label: 'Source', color: '#f88' },
    { id: 'sink', label: 'Sink', color: '#88f' },
    { id: 'shield', label: 'Shield', color: '#8f8' },
    { id: 'probe', label: 'Probe', color: '#ff8' },
    { id: 'erase', label: 'Erase', color: '#aaa' }
  ];

  const setActiveTool = (t: ToolType) => {
    state.activeTool = t;
    document.querySelectorAll('.palette-btn').forEach(b => {
      const btn = b as HTMLElement;
      const active = btn.dataset.tool === t;
      btn.style.background = active ? '#66a' : '#333';
      btn.style.borderColor = active ? '#aaf' : '#555';
    });
  };

  for (const t of tools) {
    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.dataset.tool = t.id;
    btn.textContent = t.label;
    btn.style.flex = '1 0 30%';
    btn.style.padding = '5px 0';
    btn.style.cursor = 'pointer';
    btn.style.border = '1px solid #555';
    btn.style.background = '#333';
    btn.style.color = '#eee';
    if (t.color) btn.style.borderLeft = `3px solid ${t.color}`;
    btn.onclick = () => setActiveTool(t.id);
    toolbar.appendChild(btn);
  }

  setActiveTool('select');
}

function initSourceControls(game: ThermoGame, state: AppState, requestRender: () => void) {
  const container = mustGetEl<HTMLDivElement>('source-controls');
  container.innerHTML = ''; // Clear for re-init
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';
  
  for (const groupId of [1, 2, 3, 4]) {
    const wrap = document.createElement('div');
    wrap.style.background = '#282828';
    wrap.style.padding = '5px';
    wrap.style.border = '1px solid #444';

    // Get current value
    const throttle = game.state.groupThrottles.get(groupId) ?? 0.0;
    const pct = Math.round(throttle * 100);

    // Header: Label + Pct
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '2px';
    header.innerHTML = `
      <span style="font-size:0.9em; color:#aaa; font-weight:bold;">GROUP ${groupId}</span>
      <span id="lbl-grp-${groupId}" style="font-size:0.9em; color:#fff;">${pct}%</span>
    `;

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(pct);
    slider.style.width = '100%';
    slider.style.cursor = 'pointer';
    slider.style.marginBottom = '5px';

    slider.oninput = () => {
      const val = parseInt(slider.value, 10);
      game.state.groupThrottles.set(groupId, val / 100);
      setText(`lbl-grp-${groupId}`, `${val}%`);
      if (!state.isPlaying) requestRender();
    };

    // Source List Container (Specific to this group)
    const list = document.createElement('div');
    list.id = `source-list-group-${groupId}`;
    list.style.fontSize = '0.8em';
    list.style.color = '#aaa';
    list.style.minHeight = '10px'; // ensure not completely collapsed
    
    wrap.appendChild(header);
    wrap.appendChild(slider);
    wrap.appendChild(list);
    container.appendChild(wrap);
  }
}

function updateSourceList(game: ThermoGame) {
    // 1. Gather active sources grouped by ID
    const sourcesByGroup = new Map<number, SourceEntity[]>();
    for (const ent of game.state.entities.values()) {
        if (ent.type === 'source') {
            const s = ent as SourceEntity;
            const g = s.groupId || 1;
            if (!sourcesByGroup.has(g)) sourcesByGroup.set(g, []);
            sourcesByGroup.get(g)!.push(s);
        }
    }

    // 2. Update each group list
    for (const groupId of [1, 2, 3, 4]) {
        const list = document.getElementById(`source-list-group-${groupId}`);
        if (!list) continue;

        const sources = sourcesByGroup.get(groupId) || [];
        
        if (sources.length === 0) {
            list.innerHTML = `<div style="padding:2px; font-style:italic; color:#555;">No sources</div>`;
            continue;
        }

        // Map existing rows
        const rows = new Map<string, HTMLElement>();
        list.querySelectorAll('.src-row').forEach(el => {
           const k = el.getAttribute('data-key');
           if (k) rows.set(k, el as HTMLElement);
        });

        const seen = new Set<string>();

        // Sort by key for stability? Or just render order.
        sources.sort((a,b) => hexCubeKey(a.pos).localeCompare(hexCubeKey(b.pos)));

        for (const s of sources) {
            const key = hexCubeKey(s.pos);
            seen.add(key);

            const temp = game.state.E.get(key) ?? 0;
            const delta = game.state.lastDeltaE.get(key) ?? 0;
            const color = getTempColor(temp);
            const activeColor = s.active ? '#ddd' : '#777';
            const statusSym = s.active ? '●' : '○';

            const sign = delta >= 0 ? '+' : '';
            const deltaColor = delta > 0.1 ? '#f88' : (delta < -0.1 ? '#aaf' : '#666');

            let row = rows.get(key);
            if (!row) {
                row = document.createElement('div');
                row.className = 'src-row';
                row.setAttribute('data-key', key);
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.background = '#00000030';
                row.style.padding = '2px 4px';
                row.style.marginTop = '1px';
                row.style.borderRadius = '2px';
                list.appendChild(row);
            }

            row.innerHTML = `
                <span style="color:${activeColor};" title="${s.active ? 'Active' : 'Inactive'}">${statusSym} ${key}</span>
                <span style="color:#aaa;">P:${s.power}</span>
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                    <span style="color:${color}; line-height:1em;">${temp.toFixed(0)}°</span>
                    <span style="color:${deltaColor}; font-size:0.7em; line-height:1em;">${sign}${delta.toFixed(1)}/t</span>
                </div>
            `;
        }

        // Remove stale
        for (const [k, el] of rows) {
            if (!seen.has(k)) el.remove();
        }
    }
}

function initShieldControls(game: ThermoGame, requestRender: () => void) {
  const container = mustGetEl<HTMLDivElement>('shield-controls');
  container.innerHTML = '';
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(4, 1fr)';
  container.style.gap = '5px';

  for (const groupId of [1, 2, 3, 4]) {
    const btn = document.createElement('button');
    btn.textContent = `⛊${groupId}`;
    btn.style.padding = '8px 0';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';

    const updateStyle = () => {
      const disabled = game.state.disabledShieldGroups.has(groupId);
      btn.style.background = disabled ? '#422' : '#252';
      btn.style.border = disabled ? '1px solid #522' : '1px solid #5a5';
      btn.style.color = disabled ? '#aaa' : '#fff';
      btn.style.opacity = disabled ? '0.6' : '1.0';
    };

    updateStyle();

    btn.onclick = () => {
      game.toggleShieldGroup(groupId);
      updateStyle();
      requestRender();
    };

    container.appendChild(btn);
  }
}


function initCapacitorControls(game: ThermoGame, requestRender: () => void) {
  const container = mustGetEl<HTMLDivElement>('capacitor-controls');
  container.innerHTML = ''; // Clear for re-init
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  for (const groupId of [1, 2, 3, 4]) {
    const cap = game.state.capacitors.get(groupId);
    if (!cap) continue;

    const wrap = document.createElement('div');
    wrap.style.background = '#222';
    wrap.style.padding = '5px';
    wrap.style.border = '1px solid #444';
    wrap.style.fontSize = '0.85em';

    // ------------------------------------------------------------
    // 1. Header: Bank Title + Probe Toggle/Slider + Cap Stats
    // ------------------------------------------------------------
    
    // Get current throttle
    const throttle = game.state.probeThrottles.get(groupId) ?? 0.0;
    const pct = Math.round(throttle * 100);

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.marginBottom = '4px';
    head.style.alignItems = 'center';
    
    head.innerHTML = `
      <div style="display:flex; flex-direction:column;">
        <span style="color:#aaa; font-weight:bold;">BANK ${groupId}</span>
        <span id="lbl-probe-val-${groupId}" style="color:#8f8; font-size:0.9em;">Probe: ${pct}%</span>
      </div>
      <div style="text-align:right;">
         <span id="lbl-cap-val-${groupId}" style="color:#fff;">${cap.stored.toFixed(0)} / ${cap.capacity}</span>
      </div>
    `;
    wrap.appendChild(head);

    // ------------------------------------------------------------
    // 2. Probe Throttle Slider (Full width)
    // ------------------------------------------------------------
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(pct);
    slider.style.width = '100%';
    slider.style.cursor = 'pointer';
    slider.style.marginBottom = '4px';
    slider.oninput = () => {
       const val = parseInt(slider.value, 10);
       game.state.probeThrottles.set(groupId, val / 100);
       // Update label immediately
       const lbl = document.getElementById(`lbl-probe-val-${groupId}`);
       if (lbl) lbl.textContent = `Probe: ${val}%`;
       if (!state.isPlaying) requestRender();
    };
    wrap.appendChild(slider);

    // Progress Bar
    const barParams = { id: `prog-cap-${groupId}`, height: '6px', color: '#4d4' };
    const bar = document.createElement('div');
    bar.style.width = '100%';
    bar.style.height = barParams.height;
    bar.style.background = '#000';
    bar.style.marginTop = '2px';
    bar.style.marginBottom = '4px';
    bar.innerHTML = `<div id="${barParams.id}" style="width:0%; height:100%; background:${barParams.color}; transition: width 0.1s;"></div>`;
    wrap.appendChild(bar);

    // ------------------------------------------------------------
    // 4. Controls Row (Discharge + Config)
    // ------------------------------------------------------------
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '4px';
    controls.style.alignItems = 'center';

    // Discharge Button
    const btn = document.createElement('button');
    btn.textContent = '⚡';
    btn.title = 'Discharge (Surcharge)';
    btn.style.width = '24px';
    btn.style.height = '24px';
    btn.style.padding = '0';
    btn.style.cursor = 'pointer';
    btn.style.background = '#d84';
    btn.style.border = '1px solid #a62';
    btn.onclick = () => {
        if (game.dischargeBank(groupId)) {
            requestRender();
        } else {
            console.log('Not enough energy to discharge');
        }
    };
    controls.appendChild(btn);

    // Stats (Total/Rate) - Mini display next to discharge? 
    // Or maybe put stats in between bar and controls?
    // Let's add a small stats row above controls.
    
    const stats = document.createElement('div');
    stats.style.display = 'flex';
    stats.style.justifyContent = 'space-between';
    stats.style.fontSize = '0.75em';
    stats.style.color = '#888';
    stats.style.marginBottom = '2px';
    // Repurposed IDs: "total" -> Cap Stored, "rate" -> Cap Delta
    stats.innerHTML = `
      <span>Cap: <span id="lbl-probe-total-${groupId}" style="color:#ccc;">0</span></span>
      <span id="lbl-probe-rate-${groupId}" style="color:#ccc;">+0.00/t</span>
    `;
    wrap.appendChild(stats);

    // Config Inputs (Cap, Drain, Cost)
    const addInput = (label: string, initialVal: number, onUpdate: (c: any, v: number) => void) => {
        const d = document.createElement('div');
        d.style.flex = '1';
        d.innerHTML = `<div style="font-size:0.7em; color:#777;">${label}</div>`;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(initialVal);
        inp.style.width = '100%';
        inp.style.background = '#111';
        inp.style.border = '1px solid #333';
        inp.style.color = '#ccc';
        inp.style.fontSize = '0.8em';
        inp.onchange = () => {
             // Dynamic lookup
             const currentCap = game.state.capacitors.get(groupId);
             if (currentCap) {
                 onUpdate(currentCap, parseFloat(inp.value));
                 requestRender();
             }
        };
        d.appendChild(inp);
        controls.appendChild(d);
    };

    addInput('Max', cap.capacity, (c, v) => c.capacity = v);
    addInput('Drain', cap.drainRate, (c, v) => c.drainRate = v);
    addInput('Cost', cap.surchargeCost, (c, v) => c.surchargeCost = v);

    wrap.appendChild(controls);
    container.appendChild(wrap);
  }
}

function updateCapacitorUI(game: ThermoGame) {
    for (const [id, cap] of game.state.capacitors) {
        const prog = document.getElementById(`prog-cap-${id}`);
        const lbl = document.getElementById(`lbl-cap-val-${id}`);
        
        if (prog && lbl) {
            const pct = Math.min(100, (cap.stored / cap.capacity) * 100);
            prog.style.width = `${pct}%`;
            
            // Visual feedback for full/throttled state
            if (cap.stored >= cap.capacity) {
                 prog.style.backgroundColor = '#f44'; // Red if full (throttled)
            } else {
                 prog.style.backgroundColor = '#4d4';
            }
            
            lbl.textContent = `${cap.stored.toFixed(0)} / ${cap.capacity}`;
        }
    }
}


// ============================================================
// Reservoir Controls
// ============================================================

function initReservoirControls(game: ThermoGame, requestRender: () => void) {
    const container = mustGetEl<HTMLDivElement>('reservoir-controls');
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '1fr 1fr 1fr'; // 3 columns
    container.style.gap = '5px';

    // We iterate over the *initial* keys, which are stable (1..N)
    for (const [id] of game.state.reservoirs) {
        // Initial fetch just for display values -> careful, this is only at INIT time
        const resInitial = game.state.reservoirs.get(id)!;
        
        const wrap = document.createElement('div');
        wrap.className = 'reservoir-card';
        wrap.setAttribute('data-id', String(id));
        wrap.style.background = '#222';
        wrap.style.border = '1px solid #444';
        wrap.style.padding = '4px';
        wrap.style.fontSize = '0.8em';

        // Title
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.color = '#aaa';
        title.textContent = `RES ${id}`;
        wrap.appendChild(title);

        // Temp
        const temp = document.createElement('div');
        temp.id = `res-temp-${id}`;
        temp.style.color = '#fff';
        temp.style.marginBottom = '2px';
        temp.textContent = '0°';
        wrap.appendChild(temp);

        // Inputs (Volume, Rad Strength)
        const inputs = document.createElement('div');
        inputs.style.display = 'flex';
        inputs.style.gap = '2px';
        inputs.style.marginBottom = '2px';

        const addInput = (label: string, initialVal: number, onUpdate: (r: any, v: number) => void) => {
            const d = document.createElement('div');
            d.style.flex = '1';
            d.innerHTML = `<div style="font-size:0.6em; color:#777;">${label}</div>`;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = String(initialVal);
            inp.style.width = '100%';
            inp.style.background = '#111';
            inp.style.border = '1px solid #333';
            inp.style.color = '#ccc';
            inp.style.fontSize = '0.85em';
            inp.onchange = () => {
                const v = parseFloat(inp.value);
                if (!isNaN(v)) {
                   // DYNAMIC LOOKUP
                   const currentRes = game.state.reservoirs.get(id);
                   if (currentRes) {
                       onUpdate(currentRes, v);
                       requestRender();
                   }
                }
            };
            d.appendChild(inp);
            inputs.appendChild(d);
        };

        addInput('Vol', resInitial.volume, (r, v) => r.volume = Math.max(1, v));
        addInput('RadStr', resInitial.radiator.strength, (r, v) => r.radiator.strength = Math.max(0, v));
        
        wrap.appendChild(inputs);

        // Radiator Toggle
        const btn = document.createElement('button');
        btn.id = `btn-rad-${id}`;
        btn.textContent = 'RAD';
        btn.style.width = '100%';
        btn.style.fontSize = '0.7em';
        btn.style.padding = '2px';
        btn.style.cursor = 'pointer';
        btn.onclick = () => {
             // DYNAMIC LOOKUP
             const currentRes = game.state.reservoirs.get(id);
             if (currentRes) {
                 currentRes.radiator.deployed = !currentRes.radiator.deployed;
                 requestRender();
             }
        };
        wrap.appendChild(btn);

        container.appendChild(wrap);
    }
}

function updateReservoirUI(game: ThermoGame) {
    for (const [id, res] of game.state.reservoirs) {
        const tempEl = document.getElementById(`res-temp-${id}`);
        if (tempEl) {
            const temp = res.heat / res.volume;
            tempEl.textContent = `${temp.toFixed(0)}°`;
            tempEl.style.color = getTempColor(temp);
        }

        const btn = document.getElementById(`btn-rad-${id}`);
        if (btn) {
            btn.style.background = res.radiator.deployed ? '#aaf' : '#333';
            btn.style.color = res.radiator.deployed ? '#000' : '#888';
            btn.style.border = res.radiator.deployed ? '1px solid #fff' : '1px solid #555';
        }
    }
}

// ============================================================
// Interaction wiring
// ============================================================

function wireGridInteractions(game: ThermoGame, hexGrid: HexGrid, state: AppState, requestRender: () => void) {
  const applyTool = (key: HexCubeKey) => {
    if (state.activeTool === 'select') {
      state.selectedKey = key;
    } else if (state.activeTool === 'erase') {
      game.setEntity(key, 'empty');
      if (state.selectedKey === key) state.selectedKey = null;
    } else {
      game.setEntity(key, state.activeTool);
    }
    requestRender();
  };

  // If HexGrid doesn't expose pointer state, we track it ourselves.
  // IMPORTANT FIX: don't paint on hover unless dragging / mouse down.
  hexGrid.onCellMouseDown = hex => {
    state.isPointerDown = true;
    applyTool(hexCubeKey(hex));
  };

  hexGrid.onCellMouseEnter = hex => {
    if (!state.isPointerDown) return;
    applyTool(hexCubeKey(hex));
  };

  hexGrid.onCellHover = hex => {
    state.hoveredKey = hexCubeKey(hex);
  };
2
  hexGrid.onCellClick = hex => {
    // Click as a single action still applies (useful on touch)
    applyTool(hexCubeKey(hex));
  };

  hexGrid.onCellRightClick = hex => {
    console.log('Right click at', hex);
  };

  // Global pointer up to end dragging even if pointer leaves board
  window.addEventListener('mouseup', () => (state.isPointerDown = false));
  window.addEventListener('mouseleave', () => (state.isPointerDown = false));
}

function wireTopControls(game: ThermoGame, state: AppState, requestRender: () => void, startLoop: () => void, stopLoop: () => void) {
  mustGetEl<HTMLButtonElement>('btn-play-pause').onclick = () => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      mustGetEl<HTMLButtonElement>('btn-play-pause').textContent = 'Pause';
      startLoop();
    } else {
      mustGetEl<HTMLButtonElement>('btn-play-pause').textContent = 'Play';
      stopLoop();
      requestRender();
    }
  };

  mustGetEl<HTMLButtonElement>('btn-step').onclick = () => {
    game.tick();
    requestRender();
  };

  mustGetEl<HTMLButtonElement>('btn-step-5').onclick = () => {
    for (let i = 0; i < 5; i++) game.tick();
    requestRender(); // FIX: you were missing this
  };

  mustGetEl<HTMLButtonElement>('btn-quench').onclick = () => {
    for (const key of game.state.E.keys()) game.state.E.set(key, 0);
    // Reset Reservoirs
    for (const res of game.state.reservoirs.values()) {
        res.heat = 0;
    }
    requestRender();
    console.log('Reactor Quenched');
  };

  const budgetSlider = mustGetEl<HTMLInputElement>('inp-tick-budget');
  budgetSlider.oninput = () => {
      const val = parseInt(budgetSlider.value, 10);
      state.tickBudgetMs = val;
      setText('lbl-tick-budget', `${val}ms`);
  };

  mustGetEl<HTMLButtonElement>('btn-save').onclick = async () => {
    const json = game.serialize();
    try {
        // @ts-ignore
        if (window.showSaveFilePicker) {
            // @ts-ignore
            const handle = await window.showSaveFilePicker({
                suggestedName: 'reactor_layout.json',
                types: [{
                    description: 'JSON File',
                    accept: {'application/json': ['.json']},
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
        } else {
             const blob = new Blob([json], { type: 'application/json' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = 'reactor_layout.json';
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
        }
        console.log('Layout exported');
    } catch (err) {
        console.error('Save cancelled or failed', err);
    }
  };

  mustGetEl<HTMLButtonElement>('btn-load').onclick = () => {
    // Hidden file input approach
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (text) {
                 game.deserialize(text);
                 
                 // Refresh Controls
                 initSourceControls(game, state, requestRender);
                 initShieldControls(game, requestRender);
                 initReservoirControls(game, requestRender);
                 initCapacitorControls(game, requestRender);
                 
                 // Reset throttles UI
                 requestRender();
                 console.log('Layout loaded from file');
            }
        };
        reader.readAsText(file);
        document.body.removeChild(input);
    };
    
    input.click();
  };

  mustGetEl<HTMLButtonElement>('btn-clear').onclick = (e) => {
    e.preventDefault();
    console.log('Btn Clear Clicked');
    // Direct clear, no confirm dialog to avoid issues
    console.log('Clearing layout...');
    game.clear();
    
    // Clear UI containers before re-initializing to avoid duplicates
    mustGetEl('source-controls').innerHTML = '';
    mustGetEl('shield-controls').innerHTML = '';
    mustGetEl('reservoir-controls').innerHTML = '';
    mustGetEl('capacitor-controls').innerHTML = '';

    // Reset controls
    initSourceControls(game, state, requestRender);
    initShieldControls(game, requestRender);
    initReservoirControls(game, requestRender);
    initCapacitorControls(game, requestRender);

    requestRender();
    console.log('Clear complete');
  };
}

function wireKeyboardShortcuts(game: ThermoGame, state: AppState, requestRender: () => void) {
  window.addEventListener('keydown', e => {
    // Group assignment (0-9)
    if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
      const groupId = parseInt(e.key, 10);
      
      // If we are hovering something, assign it
      if (state.hoveredKey) {
        const ent = game.state.entities.get(state.hoveredKey);
        // Apply to any entity that has a groupId property/slot
        if (ent && (ent.type === 'source' || ent.type === 'shield' || ent.type === 'probe' || ent.type === 'sink')) {
          ent.groupId = groupId;
          requestRender();
        }
      }
    }
  });
}

// ----------------------------------------------------------------------
// Bootstrap
// ----------------------------------------------------------------------

const app = mustGetEl<HTMLDivElement>('app');
mountLayout(app);

const { game, hexGrid, layout } = createGameAndGrid();

const state: AppState = {
  isPlaying: false,
  rafId: null,
  activeTool: 'select',
  selectedKey: null,
  isPointerDown: false,
  hoveredKey: null,
  lastSidebarSig: { selectedKey: null, entityType: 'empty' },
  tickBudgetMs: 100, // Default 100ms
  lastTickTime: 0,
  lastTickDuration: 0
};

const requestRender = () => renderFrame(game, hexGrid, state);

// Init Controls
initPalette(state);
initSourceControls(game, state, requestRender);
initShieldControls(game, requestRender);
initReservoirControls(game, requestRender);
initCapacitorControls(game, requestRender); // Unified

wireGridInteractions(game, hexGrid, state, requestRender);
wireTopControls(game, state, requestRender, startLoop, stopLoop);
wireKeyboardShortcuts(game, state, requestRender);

// Loop
function loop(timestamp: number) {
  if (!state.isPlaying) return;
  
  // Throttling logic
  const elapsed = timestamp - state.lastTickTime;
  
  if (elapsed >= state.tickBudgetMs) {
      // Run tick
      const t0 = performance.now();
      game.tick();
      const t1 = performance.now();
      
      state.lastTickDuration = t1 - t0;
      state.lastTickTime = timestamp; 
      // If we are way behind, do we jump forward? 
      // For now, simple "at least N ms" pacing. 
      // To strictly adhere to a grid, we might adjust lastTickTime differently, 
      // but "at least N ms" is usually what people mean by a delay/budget.
      // If we want "fixed rate" we would do: state.lastTickTime += state.tickBudgetMs;
      // But if the budget is adjustable, "last time we ticked" is safer to prevent catch-up bursts.
  }

  // Render every frame to keep UI responsive
  renderFrame(game, hexGrid, state);
  
  state.rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
}

// Initial Render
game.deserialize(JSON.stringify(defaultLayout));
initSourceControls(game, state, requestRender);
initShieldControls(game, requestRender);
initReservoirControls(game, requestRender);
initCapacitorControls(game, requestRender);

requestRender();

window.addEventListener('resize', () => {
    // Recalculate center
    // Sidebars: Left=300px, Right=280px. Total=580px.
    const newCenterX = (window.innerWidth - 580) / 2;
    const newCenterY = window.innerHeight / 2;

    layout.origin.x = newCenterX;
    layout.origin.y = newCenterY;
    hexGrid.updateLayout(layout);
    requestRender();
});

