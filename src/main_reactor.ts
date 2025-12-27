import './style.css';
import { type SinkEntity, type SourceEntity, ThermoGame } from './game_2/game';
import { getThermoStyle, mapThermoToHexGrid } from './game_2/render';
import { HexGrid } from './ui/hex_grid';
import { cubeKey, type CubeKey, generateHexagon, type Layout } from './lib/hexlib';

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
    <div id="reactor-sidebar" style="width:320px; background:#222; color:#eee; display:flex; flex-direction:column; align-items:flex-start; padding:10px; border-right:1px solid #444; z-index:10; box-sizing:border-box;">
      <h2 style="margin-top:0;">Reactor Core</h2>

      <div class="panel-section" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="btn-play-pause">Play</button>
        <button id="btn-step">Step</button>
        <button id="btn-step-5">+5</button>
        <button id="btn-quench" style="background:#44a; color:white;">Quench</button>
      </div>

      <div class="panel-section" style="display:flex; gap:8px; margin-top:5px;">
        <button id="btn-save" style="flex:1; background:#444;">Save Layout</button>
        <button id="btn-load" style="flex:1; background:#444;">Load Layout</button>
      </div>

      <div style="margin:10px 0;">Tick: <span id="tick-count">0</span></div>

      <hr style="border-color:#444; width:100%;" />

      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">TOOLS</div>
      <div class="panel-section" id="palette-toolbar" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">SOURCE CONTROLS</div>
      <div id="source-controls" style="margin-bottom:10px;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">SHIELD CONTROLS</div>
      <div id="shield-controls" style="margin-bottom:10px;"></div>

      <hr style="border-color:#444; width:100%;" />
      <div style="font-size:0.85em; color:#aaa; margin-bottom:5px;">CAPACITOR BANKS & PROBES</div>
      <div id="capacitor-controls" style="margin-bottom:10px;"></div>

      <hr style="border-color:#444; width:100%;" />

      <div id="entity-list" style="flex:1; overflow-y:auto; font-size:14px;"></div>
    </div>

    <div id="reactor-main" style="flex:1; position:relative; background:#111; overflow:hidden;">
      <div id="game-board" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
    </div>
  </div>
  `;
}

// ============================================================
// Types / State
// ============================================================

type ToolType = 'select' | 'source' | 'sink' | 'shield' | 'probe' | 'erase';

type SidebarSignature = {
  selectedKey: CubeKey | null;
  entityType: string; // 'empty' | entity.type
};

type AppState = {
  isPlaying: boolean;
  rafId: number | null;

  activeTool: ToolType;
  selectedKey: CubeKey | null;

  // For drag painting
  isPointerDown: boolean;
  hoveredKey: CubeKey | null;

  // Sidebar rebuild heuristics
  lastSidebarSig: SidebarSignature;
};

// ============================================================
// Game + Grid Init
// ============================================================

function createGameAndGrid() {
  const radius = 8;
  const cubes = generateHexagon(radius);
  const keys = cubes.map(c => cubeKey(c));
  const game = new ThermoGame(keys);

  // Sidebar is 320px
  const centerX = (window.innerWidth - 320) / 2;
  const centerY = window.innerHeight / 2;

  const layout: Layout = {
    size: { x: 30, y: 30 },
    origin: { x: centerX, y: centerY },
    orientation: 'pointy'
  };

  const boardEl = mustGetEl<HTMLDivElement>('game-board');
  const hexGrid = new HexGrid(boardEl, layout);

  return { game, hexGrid };
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

  setText('tick-count', String(game.tickCount));

  // Sidebar: rebuild structure only when necessary
  // We need to pass a "requestRender" function to updateSidebar so it can be passed to click handlers
  // effectively closing the loop.
  const triggerRender = () => renderFrame(game, hexGrid, state);
  updateSidebar(game, state, triggerRender);

  // Probe totals: targeted updates
  for (const id of [1, 2, 3, 4]) {
    const lbl = document.getElementById(`lbl-probe-total-${id}`);
    if (lbl) lbl.textContent = (game.totalEnergyCollected.get(id) ?? 0).toFixed(1);

    const rateLbl = document.getElementById(`lbl-probe-rate-${id}`);
    if (rateLbl) {
        const rate = (game.lastTickEnergy.get(id) ?? 0).toFixed(2);
        rateLbl.textContent = `+${rate}/t`;
    }
  }

  updateCapacitorUI(game);
  updateSourceList(game); // Update dynamic source list
  for (const id of [1, 2, 3, 4]) {
    // Total -> Capacitor Stored
    const lbl = document.getElementById(`lbl-probe-total-${id}`);
    const cap = game.capacitors.get(id);
    if (lbl && cap) lbl.textContent = (cap.stored).toFixed(0);

    // Rate -> Capacitor Delta
    const rateLbl = document.getElementById(`lbl-probe-rate-${id}`);
    if (rateLbl) {
        // Delta
        const delta = (game.lastCapacitorDelta.get(id) ?? 0);
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

function computeSidebarSig(game: ThermoGame, selectedKey: CubeKey | null): SidebarSignature {
  const ent = selectedKey ? game.entities.get(selectedKey) : undefined;
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
    const ent = game.entities.get(state.selectedKey);

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
            s.groupId,
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
        detail.appendChild(createNumInput('Max Dump', s.dumpMax, v => (s.dumpMax = v), 1, 'inp-dump'));
        detail.appendChild(createNumInput('Cap Scale', s.capacityScale, v => (s.capacityScale = v), 1, 'inp-cap'));
        detail.appendChild(createNumInput('Conductivity', s.conductivity, v => (s.conductivity = v), 0.1, 'inp-cond'));

        const stored = document.createElement('div');
        stored.style.marginTop = '5px';
        stored.innerHTML = `Stored Heat: <span id="val-stored">${s.stored.toFixed(1)}</span>`;
        detail.appendChild(stored);
      }

      if (ent.type === 'shield') {
        const s = ent as any;
        detail.appendChild(createNumInput('Conductivity', s.conductivity, v => (s.conductivity = v), 0.01, 'inp-cond'));
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
        const p = ent as any;
        if (p.groupId === undefined) p.groupId = 1;

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

function updateSidebarValues(game: ThermoGame, selectedKey: CubeKey | null) {
  if (!selectedKey) return;

  const temp = game.E.get(selectedKey) ?? 0;
  const ent = game.entities.get(selectedKey);

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

  if (ent.type === 'source') {
    const s = ent as SourceEntity;
    updateInputIfNotFocused('inp-power', s.power);
    updateInputIfNotFocused('inp-minactive', s.minActivation);
    updateInputIfNotFocused('inp-group', s.groupId);

    const btn = document.getElementById('btn-active-toggle') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = s.active ? 'ACTIVE' : 'INACTIVE';
      btn.style.background = s.active ? '#2b2' : '#b22';
    }
  }

  if (ent.type === 'sink') {
    const s = ent as SinkEntity;
    updateInputIfNotFocused('inp-pull', s.pullRate);
    updateInputIfNotFocused('inp-dump', s.dumpMax);
    updateInputIfNotFocused('inp-cap', s.capacityScale);
    updateInputIfNotFocused('inp-cond', s.conductivity);

    const storedEl = document.getElementById('val-stored');
    if (storedEl) storedEl.textContent = s.stored.toFixed(1);
  }

  if (ent.type === 'shield') {
    updateInputIfNotFocused('inp-cond', (ent as any).conductivity);
    updateInputIfNotFocused('inp-shield-group', (ent as any).groupId ?? 1);
  }

  if (ent.type === 'probe') {
    const p = ent as any;
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
  const groups: Record<'source' | 'sink' | 'shield' | 'probe', Array<{ key: CubeKey; entity: any }>> = {
    source: [],
    sink: [],
    shield: [],
    probe: []
  };

  for (const [k, e] of game.entities) {
    const t = e.type as keyof typeof groups;
    if (groups[t]) groups[t].push({ key: k, entity: e });
  }

  const renderGroup = (title: string, items: Array<{ key: CubeKey; entity: any }>) => {
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
  if (ent.type === 'sink') return `Stored: ${Number(ent.stored).toFixed(0)}`;
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
    const throttle = game.groupThrottles.get(groupId) ?? 0.0;
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
      game.groupThrottles.set(groupId, val / 100);
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
    for (const ent of game.entities.values()) {
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
        sources.sort((a,b) => cubeKey(a.pos).localeCompare(cubeKey(b.pos)));

        for (const s of sources) {
            const key = cubeKey(s.pos);
            seen.add(key);

            const temp = game.E.get(key) ?? 0;
            const delta = game.lastDeltaE.get(key) ?? 0;
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
      const disabled = game.disabledShieldGroups.has(groupId);
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
    const cap = game.capacitors.get(groupId);
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
    const throttle = game.probeThrottles.get(groupId) ?? 0.0;
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
       game.probeThrottles.set(groupId, val / 100);
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
    const addInput = (label: string, val: number, onChange: (v: number) => void) => {
        const d = document.createElement('div');
        d.style.flex = '1';
        d.innerHTML = `<div style="font-size:0.7em; color:#777;">${label}</div>`;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(val);
        inp.style.width = '100%';
        inp.style.background = '#111';
        inp.style.border = '1px solid #333';
        inp.style.color = '#ccc';
        inp.style.fontSize = '0.8em';
        inp.onchange = () => {
            onChange(parseFloat(inp.value));
            requestRender();
        };
        d.appendChild(inp);
        controls.appendChild(d);
    };

    addInput('Max', cap.capacity, v => {
        const c = game.capacitors.get(groupId);
        if (c) c.capacity = v;
    });
    addInput('Drain', cap.drainRate, v => {
        const c = game.capacitors.get(groupId);
        if (c) c.drainRate = v;
    });
    addInput('Cost', cap.surchargeCost, v => {
        const c = game.capacitors.get(groupId);
        if (c) c.surchargeCost = v;
    });

    wrap.appendChild(controls);
    container.appendChild(wrap);
  }
}

function updateCapacitorUI(game: ThermoGame) {
    for (const [id, cap] of game.capacitors) {
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
// Interaction wiring
// ============================================================

function wireGridInteractions(game: ThermoGame, hexGrid: HexGrid, state: AppState, requestRender: () => void) {
  const applyTool = (key: CubeKey) => {
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
    applyTool(cubeKey(hex));
  };

  hexGrid.onCellMouseEnter = hex => {
    if (!state.isPointerDown) return;
    applyTool(cubeKey(hex));
  };

  hexGrid.onCellHover = hex => {
    state.hoveredKey = cubeKey(hex);
  };
2
  hexGrid.onCellClick = hex => {
    // Click as a single action still applies (useful on touch)
    applyTool(cubeKey(hex));
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
    for (const key of game.E.keys()) game.E.set(key, 0);
    for (const ent of game.entities.values()) {
      if (ent.type === 'sink') (ent as SinkEntity).stored = 0;
    }
    requestRender();
    console.log('Reactor Quenched');
  };

  mustGetEl<HTMLButtonElement>('btn-save').onclick = () => {
    const json = game.serialize();
    localStorage.setItem('reactor_layout_v1', json);
    console.log('Layout saved to localStorage');
    alert('Layout saved!');
  };

  mustGetEl<HTMLButtonElement>('btn-load').onclick = () => {
    const json = localStorage.getItem('reactor_layout_v1');
    if (json) {
        game.deserialize(json);
        
        // Refresh Controls to reflect loaded state
        // Re-initialize controls to pick up new values
        // Ideally we would have updateXXX() methods, but re-init works if we clear container
        initSourceControls(game, state, requestRender);
        initShieldControls(game, requestRender);
        initCapacitorControls(game, requestRender);

        requestRender();
        console.log('Layout loaded from localStorage');
    } else {
        alert('No saved layout found.');
    }
  };
}

function wireKeyboardShortcuts(game: ThermoGame, state: AppState, requestRender: () => void) {
  window.addEventListener('keydown', e => {
    // Group assignment (1-4)
    if (['1', '2', '3', '4'].includes(e.key)) {
      const groupId = parseInt(e.key, 10);
      
      // If we are hovering something, assign it
      if (state.hoveredKey) {
        const ent = game.entities.get(state.hoveredKey);
        if (ent && (ent.type === 'source' || ent.type === 'shield' || ent.type === 'probe')) {
          (ent as any).groupId = groupId;
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

const { game, hexGrid } = createGameAndGrid();

const state: AppState = {
  isPlaying: false,
  rafId: null,
  activeTool: 'select',
  selectedKey: null,
  isPointerDown: false,
  hoveredKey: null,
  lastSidebarSig: { selectedKey: null, entityType: 'empty' }
};

const requestRender = () => renderFrame(game, hexGrid, state);

// Init Controls
initPalette(state);
initSourceControls(game, state, requestRender);
initShieldControls(game, requestRender);
// initProbeControls(game, state, requestRender); // REMOVED
initCapacitorControls(game, requestRender); // Unified

wireGridInteractions(game, hexGrid, state, requestRender);
wireTopControls(game, state, requestRender, startLoop, stopLoop);
wireKeyboardShortcuts(game, state, requestRender);

// Loop
function loop() {
  if (!state.isPlaying) return;
  
  // Rate limit? Nah, run as fast as possible or fixed step?
  // Let's do fixed step for simulation stability if needed, or just per-frame
  game.tick();
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
requestRender();

