/**
 * Kerto-Ripa Box Slab Calculator - Main JavaScript
 * Vanilla JS implementation matching React frontend style
 */

const API_BASE = 'http://localhost:5000/api';

// State
let supports = [
    { id: 1, support_type: 'pinned', position_m: 0.00 },
    { id: 2, support_type: 'roller', position_m: 5.50 }
];

let projectActions = [
    {
        id: 'g1',
        action_type: 'permanent',
        name: 'Peso propio',
        value_kN_per_m2: 1.5,
        distribution: 'uniform',
        origin: 'self_weight',
        psi0: 0.7, psi1: 0.5, psi2: 0.3
    },
    {
        id: 'g2',
        action_type: 'permanent',
        name: 'Acabados e instalaciones',
        value_kN_per_m2: 0.5,
        distribution: 'uniform',
        origin: 'non_structural',
        psi0: 0.7, psi1: 0.5, psi2: 0.3
    },
    {
        id: 'q1',
        action_type: 'imposed',
        name: 'Sobrecarga residencial',
        value_kN_per_m2: 2.0,
        distribution: 'uniform',
        imposed_load_category: 'A',
        psi0: 0.7, psi1: 0.5, psi2: 0.3
    }
];

let selectedActionId = 'g1';
let nextActionId = { g: 2, q: 1, s: 0, w: 0 };
let result = null;
let charts = { moment: null, shear: null, deflection: null };

// Helpers
function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(num);
}

// Tab navigation
document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
        document.getElementById(`tab-${tabId}`).style.display = 'block';
    });
});

// Support management
function renderSupports() {
    const list = document.getElementById('supports-list');
    const span = toNumber(document.getElementById('L_ef_mm')?.value || 5500) / 1000;

    list.innerHTML = supports.map((s, i) => `
        <div class="support-row" data-id="${s.id}">
            <div class="field">
                <label>Tipo de apoyo ${i + 1}</label>
                <select class="support-type" data-id="${s.id}">
                    <option value="pinned" ${s.support_type === 'pinned' ? 'selected' : ''}>Articulado</option>
                    <option value="roller" ${s.support_type === 'roller' ? 'selected' : ''}>Rodillo</option>
                    <option value="fixed" ${s.support_type === 'fixed' ? 'selected' : ''}>Empotrado</option>
                </select>
            </div>
            <div class="field">
                <label>Ubicación (m)</label>
                <input type="number" class="support-position" data-id="${s.id}" value="${s.position_m}" step="0.01" min="0" max="${span}">
            </div>
            <button type="button" class="icon-button" onclick="removeSupport(${s.id})" ${supports.length <= 2 ? 'disabled' : ''}>Quitar</button>
        </div>
    `).join('');

    // Add event listeners
    list.querySelectorAll('.support-type').forEach(sel => {
        sel.addEventListener('change', e => {
            const id = parseInt(e.target.dataset.id);
            const s = supports.find(s => s.id === id);
            if (s) s.support_type = e.target.value;
        });
    });

    list.querySelectorAll('.support-position').forEach(inp => {
        inp.addEventListener('change', e => {
            const id = parseInt(e.target.dataset.id);
            const s = supports.find(s => s.id === id);
            if (s) {
                s.position_m = Math.max(0, Math.min(toNumber(e.target.value), span));
                e.target.value = s.position_m;
            }
        });
    });

    document.getElementById('supports-count').textContent = `${supports.length} apoyos`;
    renderBeamSVG();
}

function addSupport() {
    const span = toNumber(document.getElementById('L_ef_mm')?.value || 5500) / 1000;
    const nextId = Math.max(...supports.map(s => s.id), 0) + 1;
    supports.push({ id: nextId, support_type: 'roller', position_m: span });
    renderSupports();
}

function removeSupport(id) {
    if (supports.length > 2) {
        supports = supports.filter(s => s.id !== id);
        renderSupports();
    }
}

document.getElementById('add-support-btn').addEventListener('click', addSupport);

// Load duration change updates beam span
document.getElementById('L_ef_mm').addEventListener('input', () => {
    const span = toNumber(document.getElementById('L_ef_mm')?.value || 5500) / 1000;
    document.getElementById('beam-span-display').textContent = span.toFixed(2);

    // Update support positions to stay within bounds
    supports.forEach(s => {
        if (s.position_m > span) {
            s.position_m = span;
        }
    });
    renderSupports();
    renderBeamSVG();
});

document.getElementById('element_width_mm').addEventListener('input', e => {
    const totalWidth = toNumber(e.target.value);
    const nRibs = toNumber(document.getElementById('n_ribs').value);
    
    // Auto-calculate rib spacing based on total width and number of ribs
    if (nRibs > 1 && totalWidth > 0) {
        const newSpacing = totalWidth / nRibs;
        document.getElementById('rib_spacing').value = Math.round(newSpacing);
    }
    
    document.getElementById('beam-width-display').textContent = e.target.value;
    document.getElementById('rib_spacing_display').textContent = document.getElementById('rib_spacing').value;
    renderSectionSVG();
    renderBeamSVG();
});

document.getElementById('n_ribs').addEventListener('input', e => {
    const nRibs = toNumber(e.target.value);
    const totalWidth = toNumber(document.getElementById('element_width_mm').value);
    
    if (nRibs > 1 && totalWidth > 0) {
        const newSpacing = totalWidth / nRibs;
        document.getElementById('rib_spacing').value = Math.round(newSpacing);
    }
    
    renderSectionSVG();
    renderBeamSVG();
});

// Section inputs - update section SVG on any change
function updateSectionDisplays() {
    document.getElementById('h_f1_display').textContent = document.getElementById('h_f1_mm').value;
    document.getElementById('h_f2_display').textContent = document.getElementById('h_f2_mm').value;
    document.getElementById('h_w_display').textContent = document.getElementById('h_w_mm').value;
    document.getElementById('b_w_display').textContent = document.getElementById('b_w_mm').value;
    document.getElementById('rib_spacing_display').textContent = document.getElementById('rib_spacing').value;
    renderSectionSVG();
}

['h_f1_mm', 'h_f2_mm', 'h_w_mm', 'b_w_mm', 'rib_spacing', 'n_ribs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.oninput = function() {
            updateSectionDisplays();
        };
    }
});

// Actions management
function getActionTypeLabel(type) {
    const labels = { permanent: 'Permanente', imposed: 'Uso', snow: 'Nieve', wind: 'Viento' };
    return labels[type] || type;
}

function getPsiFactors(actionType) {
    if (actionType === 'permanent') return { psi0: 0, psi1: 0, psi2: 0 };
    if (actionType === 'imposed') return { psi0: 0.7, psi1: 0.5, psi2: 0.3 };
    if (actionType === 'snow') return { psi0: 0.7, psi1: 0.5, psi2: 0.2 };
    if (actionType === 'wind') return { psi0: 0.6, psi1: 0.2, psi2: 0.0 };
    return { psi0: 0.7, psi1: 0.5, psi2: 0.3 };
}

function createActionId(actionType) {
    const prefix = actionType === 'permanent' ? 'g' : actionType === 'imposed' ? 'q' : actionType === 'snow' ? 's' : 'w';
    nextActionId[prefix]++;
    return `${prefix}${nextActionId[prefix]}`;
}

function addAction(actionType) {
    const psi = getPsiFactors(actionType);
    const names = {
        permanent: 'Nueva carga permanente',
        imposed: 'Nueva sobrecarga de uso',
        snow: 'Nueva carga de nieve',
        wind: 'Nueva carga de viento'
    };

    const newAction = {
        id: createActionId(actionType),
        action_type: actionType,
        name: names[actionType],
        value_kN_per_m2: 0,
        distribution: 'uniform',
        origin: actionType === 'permanent' ? 'non_structural' : 'self_weight',
        imposed_load_category: 'A',
        ...psi
    };

    projectActions.push(newAction);
    selectedActionId = newAction.id;
    renderActions();
    renderCombinationPreview();
}

function removeAction(id) {
    if (projectActions.length > 1) {
        projectActions = projectActions.filter(a => a.id !== id);
        if (selectedActionId === id) {
            selectedActionId = projectActions[0]?.id;
        }
        renderActions();
        renderCombinationPreview();
    }
}

function renderActions() {
    const list = document.getElementById('actions-list');
    const editor = document.getElementById('action-editor');

    list.innerHTML = projectActions.map(a => `
        <article class="action-card ${a.id === selectedActionId ? 'active' : ''}" data-id="${a.id}">
            <button type="button" class="action-card-main" onclick="selectAction('${a.id}')">
                <div class="action-card-top">
                    <span class="action-badge type-${a.action_type}">${a.id.toUpperCase()}</span>
                    <span class="action-type-label">${getActionTypeLabel(a.action_type)}</span>
                </div>
                <strong>${a.name}</strong>
                <p>${formatNumber(a.value_kN_per_m2)} kN/m²</p>
            </button>
            <button type="button" class="icon-button action-remove" onclick="removeAction('${a.id}')" ${projectActions.length <= 1 ? 'disabled' : ''}>Quitar</button>
        </article>
    `).join('');

    // Render action editor
    const selected = projectActions.find(a => a.id === selectedActionId);
    if (selected) {
        editor.innerHTML = `
            <div class="action-editor-head">
                <h4>Editor de acción</h4>
                <span>${selected.id.toUpperCase()}</span>
            </div>
            <div class="field-grid">
                <div class="field">
                    <label>Nombre</label>
                    <input type="text" id="action-name" value="${selected.name}">
                </div>
                <div class="field">
                    <label>Valor (kN/m²)</label>
                    <input type="number" id="action-value" value="${selected.value_kN_per_m2}" step="0.1" min="0">
                </div>
                ${selected.action_type !== 'permanent' ? `
                <div class="field">
                    <label>ψ0</label>
                    <input type="number" id="action-psi0" value="${selected.psi0}" step="0.05" min="0" max="1">
                </div>
                <div class="field">
                    <label>ψ1</label>
                    <input type="number" id="action-psi1" value="${selected.psi1}" step="0.05" min="0" max="1">
                </div>
                <div class="field">
                    <label>ψ2</label>
                    <input type="number" id="action-psi2" value="${selected.psi2}" step="0.05" min="0" max="1">
                </div>
                ` : ''}
            </div>
        `;

        // Event listeners for editor
        document.getElementById('action-name')?.addEventListener('change', e => {
            selected.name = e.target.value;
            renderActions();
        });
        document.getElementById('action-value')?.addEventListener('change', e => {
            selected.value_kN_per_m2 = toNumber(e.target.value);
            renderActions();
            renderCombinationPreview();
        });
        document.getElementById('action-psi0')?.addEventListener('change', e => {
            selected.psi0 = toNumber(e.target.value);
            renderCombinationPreview();
        });
        document.getElementById('action-psi1')?.addEventListener('change', e => {
            selected.psi1 = toNumber(e.target.value);
            renderCombinationPreview();
        });
        document.getElementById('action-psi2')?.addEventListener('change', e => {
            selected.psi2 = toNumber(e.target.value);
            renderCombinationPreview();
        });
    }
}

function selectAction(id) {
    selectedActionId = id;
    renderActions();
}

// Action toolbar buttons
document.querySelectorAll('.action-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => addAction(btn.dataset.actionType));
});

// Combination preview
function buildCombinationPreview() {
    const ULS_GAMMA_G = 1.35;
    const ULS_GAMMA_Q = 1.50;
    const permanent = projectActions.filter(a => a.action_type === 'permanent');
    const variable = projectActions.filter(a => a.action_type !== 'permanent');

    const combinations = [];

    if (permanent.length === 0 && variable.length === 0) {
        return combinations;
    }

    // Permanent total
    const permTotal = permanent.reduce((sum, a) => sum + a.value_kN_per_m2, 0);
    const permExpr = permanent.map(a => `${a.id.toUpperCase()}`).join(' + ') || '0';

    if (variable.length === 0) {
        combinations.push({
            id: 'uls-only',
            title: 'ULS fundamental',
            expression: permanent.map(a => `1.35·${a.id.toUpperCase()}`).join(' + ') || '0',
            total: permTotal * ULS_GAMMA_G
        });
        return combinations;
    }

    variable.forEach(leading => {
        const leadingId = leading.id.toUpperCase();
        const others = variable.filter(a => a.id !== leading.id);

        // ULS fundamental
        combinations.push({
            id: `uls-${leading.id}`,
            title: `ULS fundamental · ${leadingId} principal`,
            expression: [
                permanent.map(a => `1.35·${a.id.toUpperCase()}`).join(' + '),
                `1.50·${leadingId}`,
                others.map(a => `1.50·ψ0·${a.id.toUpperCase()}`).join(' + ')
            ].filter(Boolean).join(' + '),
            total: permTotal * ULS_GAMMA_G +
                   leading.value_kN_per_m2 * ULS_GAMMA_Q +
                   others.reduce((sum, a) => sum + a.value_kN_per_m2 * a.psi0 * ULS_GAMMA_Q, 0)
        });

        // SLS characteristic
        combinations.push({
            id: `sls-char-${leading.id}`,
            title: `SLS characteristic · ${leadingId} principal`,
            expression: [permExpr, leadingId, others.map(a => `ψ0·${a.id.toUpperCase()}`).join(' + ')].filter(Boolean).join(' + '),
            total: permTotal + leading.value_kN_per_m2 + others.reduce((sum, a) => sum + a.value_kN_per_m2 * a.psi0, 0)
        });

        // SLS frequent
        combinations.push({
            id: `sls-freq-${leading.id}`,
            title: `SLS frequent · ${leadingId} principal`,
            expression: [permExpr, `ψ1·${leadingId}`, others.map(a => `ψ2·${a.id.toUpperCase()}`).join(' + ')].filter(Boolean).join(' + '),
            total: permTotal + leading.value_kN_per_m2 * leading.psi1 + others.reduce((sum, a) => sum + a.value_kN_per_m2 * a.psi2, 0)
        });
    });

    // SLS quasi-permanent
    combinations.push({
        id: 'sls-qp',
        title: 'SLS quasi-permanent',
        expression: [permExpr, variable.map(a => `ψ2·${a.id.toUpperCase()}`).join(' + ')].filter(Boolean).join(' + '),
        total: permTotal + variable.reduce((sum, a) => sum + a.value_kN_per_m2 * a.psi2, 0)
    });

    return combinations;
}

function renderCombinationPreview() {
    const list = document.getElementById('combination-preview-list');
    const combinations = buildCombinationPreview();

    list.innerHTML = combinations.map(c => `
        <article class="combination-card">
            <div class="combination-card-head">
                <h4>${c.title}</h4>
                <strong>${formatNumber(c.total)} kN/m²</strong>
            </div>
            <p>${c.expression}</p>
        </article>
    `).join('');
}

// Beam SVG rendering
function renderBeamSVG() {
    const svg = document.getElementById('beam-svg');
    if (!svg) return;

    const span = toNumber(document.getElementById('L_ef_mm')?.value || 5500);
    const width = 600;
    const height = 120;
    const beamY = 70;
    const marginX = 30;
    const usableWidth = width - 2 * marginX;
    const scale = usableWidth / span;

    let html = '';

    // Draw beam baseline
    html += `<line x1="${marginX}" y1="${beamY}" x2="${width - marginX}" y2="${beamY}" class="beam-baseline"/>`;

    // Draw supports - separate them vertically to avoid overlap
    const sortedSupports = [...supports].sort((a, b) => a.position_m - b.position_m);
    
    sortedSupports.forEach((s, i) => {
        const baseX = marginX + s.position_m * scale;
        const isFixed = s.support_type === 'fixed';
        const isPinned = s.support_type === 'pinned';

        // Calculate Y offset based on support type to separate them
        // Use different vertical positions for different types
        let offsetY = 0;
        
        // Group supports by approximate position to avoid overlap
        const prevSupports = sortedSupports.slice(0, i);
        const nearbySupports = prevSupports.filter(ps => 
            Math.abs(ps.position_m - s.position_m) < 0.5  // Within 0.5m
        );
        
        if (nearbySupports.length > 0) {
            offsetY = nearbySupports.length * 12;
        }

        if (isFixed) {
            // Fixed support (hatched rectangle)
            html += `<rect x="${baseX - 15}" y="${beamY - offsetY}" width="30" height="20" class="beam-support fixed"/>`;
            html += `<line x1="${baseX - 15}" y1="${beamY - offsetY + 20}" x2="${baseX + 15}" y2="${beamY - offsetY + 20}" class="beam-support-hatch"/>`;
            html += `<line x1="${baseX - 10}" y1="${beamY - offsetY + 5}" x2="${baseX + 10}" y2="${beamY - offsetY + 15}" class="beam-support-hatch"/>`;
        } else if (isPinned) {
            // Pinned support (triangle)
            html += `<polygon points="${baseX},${beamY - offsetY} ${baseX - 14},${beamY - offsetY + 18} ${baseX + 14},${beamY - offsetY + 18}" class="beam-support"/>`;
        } else {
            // Roller (circle)
            html += `<circle cx="${baseX}" cy="${beamY - offsetY + 8}" r="8" class="beam-support roller"/>`;
        }

        // Label for support number
        html += `<text x="${baseX}" y="${beamY + 18}" text-anchor="middle" class="beam-label">${i + 1}</text>`;
        
        // Position label
        html += `<text x="${baseX}" y="${beamY + 32}" text-anchor="middle" class="support-position-label">${s.position_m.toFixed(2)}m</text>`;
    });

    // Draw span dimension
    html += `<line x1="${marginX}" y1="${height - 10}" x2="${width - marginX}" y2="${height - 10}" class="dimension-line"/>`;
    html += `<line x1="${marginX}" y1="${height - 15}" x2="${marginX}" y2="${height - 5}" class="dimension-line"/>`;
    html += `<line x1="${width - marginX}" y1="${height - 15}" x2="${width - marginX}" y2="${height - 5}" class="dimension-line"/>`;
    html += `<text x="${width/2}" y="${height - 18}" text-anchor="middle" class="dimension-text">L = ${(span/1000).toFixed(2)} m</text>`;

    svg.innerHTML = html;
}

// Section SVG rendering - Kerto-Ripa Box Slab
function renderSectionSVG() {
    const svg = document.getElementById('section-svg');
    if (!svg) return;

    // Get all parameters
    const h_f1 = toNumber(document.getElementById('h_f1_mm').value) || 25;
    const h_f2 = toNumber(document.getElementById('h_f2_mm').value) || 25;
    const h_w = toNumber(document.getElementById('h_w_mm').value) || 225;
    const b_w = toNumber(document.getElementById('b_w_mm').value) || 45;
    const rib_spacing = toNumber(document.getElementById('rib_spacing').value) || 585;
    const n_ribs = toNumber(document.getElementById('n_ribs').value) || 2;

    // SVG dimensions
    const svgWidth = 400;
    const svgHeight = 180;
    const marginX = 30;
    const marginY = 20;

    // Calculate scale to fit in SVG
    // Total width: n ribs + overhang on each side (half spacing)
    const totalStructuralWidth = (n_ribs - 1) * rib_spacing + b_w + rib_spacing;
    const scaleX = (svgWidth - 2 * marginX) / totalStructuralWidth;
    const totalHeight = h_f1 + h_w + h_f2;
    const scaleY = (svgHeight - 2 * marginY) / totalHeight;
    const scale = Math.min(scaleX, scaleY);

    // Scaled dimensions
    const sf1 = Math.max(h_f1 * scale, 5);    // Top flange thickness
    const sf2 = Math.max(h_f2 * scale, 5);    // Bottom flange thickness  
    const sw = Math.max(h_w * scale, 40);    // Web height
    const bw = Math.max(b_w * scale, 10);   // Web width
    const spacing = Math.max(rib_spacing * scale, 25); // Spacing between ribs
    const overhang = spacing / 2;                 // Overhang beyond outer ribs

    // Y positions (top to bottom)
    const yTop = marginY;
    const yF1Bottom = yTop + sf1;
    const yWebBottom = yF1Bottom + sw;
    const yBottom = yWebBottom + sf2;

    // Calculate start X to center the section
    const totalDrawingWidth = bw + spacing * (n_ribs - 1) + overhang * 2;
    const startX = marginX + (svgWidth - 2 * marginX - totalDrawingWidth) / 2;

    let html = '';

    // 1. Draw TOP FLANGE (continuous slab spanning all ribs)
    const topFlangeWidth = bw + spacing * (n_ribs - 1) + overhang * 2;
    const topFlangeX = startX;
    html += `<rect x="${topFlangeX}" y="${yTop}" width="${topFlangeWidth}" height="${sf1}" 
             fill="#8B7355" stroke="#5D4E37" stroke-width="1.5"/>`;

    // 2. Draw BOTTOM FLANGE (continuous slab)
    const bottomFlangeWidth = topFlangeWidth;
    const bottomFlangeX = topFlangeX;
    html += `<rect x="${bottomFlangeX}" y="${yWebBottom}" width="${bottomFlangeWidth}" height="${sf2}" 
             fill="#8B7355" stroke="#5D4E37" stroke-width="1.5"/>`;

    // 3. Draw WEBS (one per rib)
    for (let i = 0; i < n_ribs; i++) {
        const webX = startX + overhang + i * spacing;
        
        // Draw web rectangle
        html += `<rect x="${webX}" y="${yF1Bottom}" width="${bw}" height="${sw}" 
                 fill="#A0522D" stroke="#5D4E37" stroke-width="1.5"/>`;
    }

    // 4. Draw dimension lines and labels
    
    // h_f1 dimension (right side)
    const dimX = svgWidth - marginX + 5;
    html += `<line x1="${dimX}" y1="${yTop}" x2="${dimX}" y2="${yF1Bottom}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yTop}" x2="${dimX + 4}" y2="${yTop}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yF1Bottom}" x2="${dimX + 4}" y2="${yF1Bottom}" stroke="#333" stroke-width="1"/>`;
    html += `<text x="${dimX + 8}" y="${yTop + sf1/2}" fill="#333" font-size="10" dominant-baseline="middle">h_f1=${h_f1}</text>`;

    // h_w dimension
    html += `<line x1="${dimX}" y1="${yF1Bottom}" x2="${dimX}" y2="${yWebBottom}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yF1Bottom}" x2="${dimX + 4}" y2="${yF1Bottom}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yWebBottom}" x2="${dimX + 4}" y2="${yWebBottom}" stroke="#333" stroke-width="1"/>`;
    html += `<text x="${dimX + 8}" y="${yF1Bottom + sw/2}" fill="#333" font-size="10" dominant-baseline="middle">h_w=${h_w}</text>`;

    // h_f2 dimension
    html += `<line x1="${dimX}" y1="${yWebBottom}" x2="${dimX}" y2="${yBottom}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yWebBottom}" x2="${dimX + 4}" y2="${yWebBottom}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${dimX - 4}" y1="${yBottom}" x2="${dimX + 4}" y2="${yBottom}" stroke="#333" stroke-width="1"/>`;
    html += `<text x="${dimX + 8}" y="${yWebBottom + sf2/2}" fill="#333" font-size="10" dominant-baseline="middle">h_f2=${h_f2}</text>`;

    // b_w dimension (on first web)
    const firstWebX = startX + overhang;
    html += `<line x1="${firstWebX}" y1="${yBottom + 8}" x2="${firstWebX + bw}" y2="${yBottom + 8}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${firstWebX}" y1="${yBottom + 5}" x2="${firstWebX}" y2="${yBottom + 11}" stroke="#333" stroke-width="1"/>`;
    html += `<line x1="${firstWebX + bw}" y1="${yBottom + 5}" x2="${firstWebX + bw}" y2="${yBottom + 11}" stroke="#333" stroke-width="1"/>`;
    html += `<text x="${firstWebX + bw/2}" y="${yBottom + 20}" fill="#333" font-size="10" text-anchor="middle">b_w=${b_w}</text>`;

    // rib spacing dimension (between first two webs)
    if (n_ribs > 1) {
        const sepX1 = firstWebX + bw;
        const sepX2 = firstWebX + spacing;
        html += `<line x1="${sepX1}" y1="${yBottom + 8}" x2="${sepX2}" y2="${yBottom + 8}" stroke="#333" stroke-width="1"/>`;
        html += `<line x1="${sepX1}" y1="${yBottom + 5}" x2="${sepX1}" y2="${yBottom + 11}" stroke="#333" stroke-width="1"/>`;
        html += `<line x1="${sepX2}" y1="${yBottom + 5}" x2="${sepX2}" y2="${yBottom + 11}" stroke="#333" stroke-width="1"/>`;
        html += `<text x="${(sepX1 + sepX2)/2}" y="${yBottom + 20}" fill="#333" font-size="10" text-anchor="middle">sep=${rib_spacing}</text>`;
    }

    // Number of ribs label
    html += `<text x="${svgWidth/2}" y="${svgHeight - 5}" fill="#666" font-size="9" text-anchor="middle">${n_ribs} nervios</text>`;

    svg.innerHTML = html;
}

function validate() {
    const errors = [];
    const span = toNumber(document.getElementById('L_ef_mm')?.value);

    if (!span || span <= 0) {
        errors.push('La luz efectiva debe ser un número positivo.');
    }

    const spanM = span / 1000;
    supports.forEach((s, i) => {
        if (s.position_m < 0 || s.position_m > spanM) {
            errors.push(`La posición del apoyo ${i + 1} debe estar entre 0 y ${spanM} m.`);
        }
    });

    if (supports.length < 2) {
        errors.push('Debes definir al menos dos apoyos.');
    }

    return errors;
}

// Calculate button
document.getElementById('calculate-btn').addEventListener('click', async () => {
    const errors = validate();
    const errorsDiv = document.getElementById('form-errors');
    const requestErrorDiv = document.getElementById('request-error');

    errorsDiv.innerHTML = errors.map(e => `<p>${e}</p>`).join('');
    errorsDiv.style.display = errors.length > 0 ? 'block' : 'none';
    requestErrorDiv.style.display = 'none';

    if (errors.length > 0) return;

    const payload = {
        cross_section: {
            section_type: 'box',
            element_width_mm: toNumber(document.getElementById('element_width_mm').value),
            n_ribs: toNumber(document.getElementById('n_ribs').value),
            h_w_mm: toNumber(document.getElementById('h_w_mm').value),
            b_w_mm: toNumber(document.getElementById('b_w_mm').value),
            h_f1_mm: toNumber(document.getElementById('h_f1_mm').value),
            h_f2_mm: toNumber(document.getElementById('h_f2_mm').value),
            rib_spacing: toNumber(document.getElementById('rib_spacing').value),
            b_actual_mm: toNumber(document.getElementById('element_width_mm').value)
        },
        span: {
            L_ef_mm: toNumber(document.getElementById('L_ef_mm').value),
            L_support_mm: 100,
            support_position: 'end'
        },
        design_basis: {
            service_class: document.getElementById('service_class').value,
            load_duration_class: document.getElementById('load_duration').value
        },
        supports: supports.map(s => ({
            support_type: s.support_type,
            position_m: s.position_m
        })),
        action_catalog: {
            actions: projectActions.map(a => ({
                id: a.id,
                pattern: {
                    action_type: a.action_type,
                    name: a.name,
                    distribution: a.distribution,
                    value_kN_per_m2: a.value_kN_per_m2
                },
                ...(a.action_type !== 'permanent' ? {
                    combination_factors: { psi0: a.psi0, psi1: a.psi1, psi2: a.psi2 }
                } : {})
            }))
        }
    };

    document.getElementById('calculate-btn').disabled = true;
    document.getElementById('calculate-btn').textContent = 'Calculando...';

    try {
        const response = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error en el cálculo');
        }

        result = normalizeResult(data);
        displayResults(result);
        switchToResultsTab();

    } catch (error) {
        requestErrorDiv.innerHTML = `<p>${error.message}</p>`;
        requestErrorDiv.style.display = 'block';
    } finally {
        document.getElementById('calculate-btn').disabled = false;
        document.getElementById('calculate-btn').textContent = 'Calcular forjado';
    }
});

function normalizeResult(body) {
    // Our API returns a different format, normalize it
    if (body?.uls_combinations !== undefined) {
        const allChecks = [...(body.uls_combinations || [])];
        const governingCheck = allChecks.reduce((worst, c) => {
            const util = c.design?.checks?.[0]?.utilization || 0;
            return util > (worst?.utilization || 0) ? c : worst;
        }, null);

        return {
            _type: 'kerto_ripa',
            summary: {
                passed: body.uls_combinations?.some(c => c.design?.all_passed) ?? false,
                governing_check: governingCheck?.design?.checks?.[0]?.name || 'N/A'
            },
            uls_checks: body.uls_combinations?.flatMap(c => c.design?.checks || []) || [],
            sls_checks: [],
            intermediate_values: {
                'EI_ef (N·mm²)': body.EI_ef,
                'a1 (mm)': body.section_properties?.a1,
                'a2 (mm)': body.section_properties?.a2,
                'a3 (mm)': body.section_properties?.a3
            },
            geometry: body.geometry,
            warnings: [],
            moment_diagram: body.moment_diagram,
            shear_diagram: body.shear_diagram,
            deflection_diagram: body.deflection_diagram,
            uls_combinations: body.uls_combinations
        };
    }
    return body;
}

function switchToResultsTab() {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="results"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
    document.getElementById('tab-results').style.display = 'block';
}

function displayResults(result) {
    // Update hero card
    const pill = document.getElementById('status-pill');
    const governing = document.getElementById('governing-check');

    if (result?.summary?.passed) {
        pill.className = 'status-pill pass';
        pill.textContent = 'Cumple';
    } else {
        pill.className = 'status-pill fail';
        pill.textContent = 'Revisar';
    }
    governing.textContent = result?.summary?.governing_check || 'Sin cálculo';

    // Show results content
    document.getElementById('results-placeholder').style.display = 'none';
    document.getElementById('results-content').style.display = 'block';

    // Summary band
    document.getElementById('result-status').textContent = result?.summary?.passed ? 'Cumple' : 'No cumple';
    document.getElementById('result-governing').textContent = result?.summary?.governing_check || '-';

    // Intermediate values
    const ivSection = document.getElementById('intermediate-values-section');
    const metricsGrid = document.getElementById('metrics-grid');
    if (result?.intermediate_values) {
        ivSection.style.display = 'block';
        metricsGrid.innerHTML = Object.entries(result.intermediate_values)
            .filter(([_, v]) => v !== null && v !== undefined)
            .map(([key, val]) => `
                <div class="result-card">
                    <span class="metric-label">${key}</span>
                    <strong>${formatNumber(val)}</strong>
                </div>
            `).join('');
    } else {
        ivSection.style.display = 'none';
    }

    // ULS checks
    const ulsSection = document.getElementById('uls-checks-section');
    const ulsList = document.getElementById('uls-checks-list');
    if (result?.uls_checks?.length > 0) {
        ulsSection.style.display = 'block';
        ulsList.innerHTML = result.uls_checks.map(c => `
            <article class="check-card">
                <div class="check-card-header">
                    <h3>${c.name || c.check || 'Verificación'}</h3>
                    <span class="status-pill ${c.passed ? 'pass' : 'fail'}">${c.passed ? 'OK' : 'No OK'}</span>
                </div>
                <p>Demanda: ${formatNumber(c.value)} ${c.unit || ''}</p>
                <p>Capacidad: ${formatNumber(c.resistance)} ${c.unit || ''}</p>
                <p>Utilización: ${formatNumber(c.utilization * 100)} %</p>
            </article>
        `).join('');
    } else {
        ulsSection.style.display = 'none';
    }

    // SLS checks
    const slsSection = document.getElementById('sls-checks-section');
    const slsList = document.getElementById('sls-checks-list');
    if (result?.sls_checks?.length > 0) {
        slsSection.style.display = 'block';
        slsList.innerHTML = result.sls_checks.map(c => `
            <article class="check-card">
                <div class="check-card-header">
                    <h3>${c.name || c.check || 'Verificación'}</h3>
                    <span class="status-pill ${c.passed ? 'pass' : 'fail'}">${c.passed ? 'OK' : 'No OK'}</span>
                </div>
                <p>Demanda: ${formatNumber(c.value)} ${c.unit || ''}</p>
                <p>Capacidad: ${formatNumber(c.resistance)} ${c.unit || ''}</p>
                <p>Utilización: ${formatNumber(c.utilization * 100)} %</p>
            </article>
        `).join('');
    } else {
        slsSection.style.display = 'none';
    }

    // Warnings
    const warningsSection = document.getElementById('warnings-section');
    const warningsList = document.getElementById('warnings-list');
    if (result?.warnings?.length > 0) {
        warningsSection.style.display = 'block';
        warningsList.innerHTML = result.warnings.map(w => `<p><strong>${w.code || ''}</strong>: ${w.message || ''}</p>`).join('');
    } else {
        warningsSection.style.display = 'none';
    }

    // Diagrams
    displayDiagrams(result);
}

function displayDiagrams(result) {
    const diagramsSection = document.getElementById('diagrams-section');

    if (!result?.moment_diagram) {
        diagramsSection.style.display = 'none';
        return;
    }
    diagramsSection.style.display = 'block';

    const momentData = result.moment_diagram;
    const shearData = result.shear_diagram;
    const deflectionData = result.deflection_diagram;

    // Destroy existing charts
    if (charts.moment) charts.moment.destroy();
    if (charts.shear) charts.shear.destroy();
    if (charts.deflection) charts.deflection.destroy();

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
            x: {
                title: { display: true, text: 'Posición (m)' }
            }
        }
    };

    // Moment chart
    charts.moment = new Chart(document.getElementById('moment-chart'), {
        type: 'line',
        data: {
            labels: momentData.x.map(x => x / 1000),
            datasets: [{
                label: 'Momento (kNm)',
                data: momentData.M,
                borderColor: '#5a8f5f',
                backgroundColor: 'rgba(90, 143, 95, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            ...commonOptions,
            scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Momento (kNm)' } } }
        }
    });

    // Shear chart
    charts.shear = new Chart(document.getElementById('shear-chart'), {
        type: 'line',
        data: {
            labels: shearData.x.map(x => x / 1000),
            datasets: [{
                label: 'Cortante (kN)',
                data: shearData.V,
                borderColor: '#28492d',
                backgroundColor: 'rgba(40, 73, 45, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            ...commonOptions,
            scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Cortante (kN)' } } }
        }
    });

    // Deflection chart
    charts.deflection = new Chart(document.getElementById('deflection-chart'), {
        type: 'line',
        data: {
            labels: deflectionData.x.map(x => x / 1000),
            datasets: [{
                label: 'Flecha (mm)',
                data: deflectionData.delta,
                borderColor: '#3d6b8c',
                backgroundColor: 'rgba(61, 107, 140, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            ...commonOptions,
            scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Flecha (mm)' } } }
        }
    });
}

// Initialize
document.getElementById('h_f1_display').textContent = document.getElementById('h_f1_mm').value;
document.getElementById('h_f2_display').textContent = document.getElementById('h_f2_mm').value;
document.getElementById('h_w_display').textContent = document.getElementById('h_w_mm').value;
document.getElementById('b_w_display').textContent = document.getElementById('b_w_mm').value;
document.getElementById('rib_spacing_display').textContent = document.getElementById('rib_spacing').value;
renderSupports();
renderActions();
renderCombinationPreview();
renderSectionSVG();
renderBeamSVG();
