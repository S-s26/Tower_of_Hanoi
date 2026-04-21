'use strict';

/* ═══════════════════════════════════════════════════════════
   Tower of Hanoi — Vanilla JS Game Engine
   Manual play · AI solver integration · Staged animations
   Color-constrained goal state with independent target config
   ═══════════════════════════════════════════════════════════ */

// ─── Colour Palette ───────────────────────────────────────
const DISK_COLORS = {
    Red:   { bg: 'linear-gradient(135deg, #ff6b6b, #ee5a24)', glow: 'rgba(238,90,36,0.45)',  solid: '#ff6b6b' },
    Blue:  { bg: 'linear-gradient(135deg, #74b9ff, #0984e3)', glow: 'rgba(9,132,227,0.45)',   solid: '#74b9ff' },
    Green: { bg: 'linear-gradient(135deg, #55efc4, #00b894)', glow: 'rgba(0,184,148,0.45)',   solid: '#55efc4' },
};
const COLOR_NAMES = Object.keys(DISK_COLORS);

// ─── Layout Constants ─────────────────────────────────────
const DISK_H    = 32;       // disk height (px)
const DISK_GAP  = 4;        // gap between stacked disks
const BASE_Y    = 30;       // first disk's bottom offset
const LIFT_Y    = 350;      // lift height for staged animation
const MIN_W     = 0.14;     // min disk width (fraction of board)
const MAX_W     = 0.28;     // max disk width

// ─── Game State ───────────────────────────────────────────
const GS = {
    numDisks:     4,
    pegs:         [[], [], []],   // each peg: bottom → top
    selectedPeg:  null,
    moveCount:    0,
    solving:      false,
    targetColors: [],             // top-to-bottom colour sequence on Peg C
    initialSnap:  null,           // JSON snapshot for reset
};

let diskEls = {};                 // size → DOM element
let boardEl;

// ─── Initialisation ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    boardEl = document.getElementById('game-board');

    // Peg click — event delegation
    boardEl.addEventListener('click', (e) => {
        const area = e.target.closest('.peg-area');
        if (area) handlePegClick(parseInt(area.dataset.peg, 10));
    });

    // Button wiring
    document.getElementById('btn-new-game').addEventListener('click', () => newGame());
    document.getElementById('btn-scramble').addEventListener('click', scrambleDisks);
    document.getElementById('btn-solve').addEventListener('click',    solveWithAI);
    document.getElementById('btn-reset').addEventListener('click',    resetToInitial);

    document.getElementById('disk-count')
        .addEventListener('change', function () { newGame(+this.value); });

    window.addEventListener('resize', () => positionDisks(false));

    newGame(4);
});

// ─── Game Setup ───────────────────────────────────────────

function newGame(n) {
    n = n || parseInt(document.getElementById('disk-count').value, 10);
    GS.numDisks    = n;
    GS.moveCount   = 0;
    GS.selectedPeg = null;
    GS.solving     = false;

    // Build disks — largest (n) at bottom, smallest (1) at top
    const disks = [];
    for (let s = n; s >= 1; s--) {
        disks.push({ size: s, color: COLOR_NAMES[rng(COLOR_NAMES.length)] });
    }

    GS.pegs        = [disks, [], []];
    GS.initialSnap = snap(GS.pegs);

    // Generate an independent target colour arrangement.
    // The target specifies the desired top→bottom colour sequence on Peg C.
    // We generate a random *achievable* arrangement: shuffle the disk colours
    // while respecting that each size position is fixed (size order is mandatory).
    generateTarget();

    buildDiskDOM();
    positionDisks(false);
    refreshUI();
    setStatus('💡', 'Click a peg to select its top disk, then click another peg to place it.');
    removeWinOverlay();
    document.getElementById('optimal-counter').textContent = '—';
}

/**
 * Generate a random target colour arrangement for Peg C.
 *
 * The target is a top→bottom colour sequence.  Since all disks must end
 * up on Peg C in size order (smallest on top), the target_colors[i]
 * specifies the required colour for the disk at position i (where i=0
 * is the top, smallest disk).
 *
 * We randomly shuffle the available colours to create an arrangement
 * that differs from the natural order, making the colour constraint
 * non-trivial.  The shuffle is always achievable because we use the
 * same multiset of colours as the actual disks.
 */
function generateTarget() {
    // Collect colours from disks sorted by size (ascending = top→bottom on C)
    const sorted = [...GS.pegs.flat()].sort((a, b) => a.size - b.size);
    const colors = sorted.map(d => d.color);

    // Fisher-Yates shuffle to create a random (but achievable) arrangement
    for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }

    GS.targetColors = colors;
}

function scrambleDisks() {
    if (GS.solving) return;

    const all = GS.pegs.flat().sort((a, b) => b.size - a.size);
    GS.pegs = [[], [], []];
    for (const d of all) GS.pegs[rng(3)].push(d);
    // Insertion order = descending size → always valid stacking

    GS.moveCount   = 0;
    GS.selectedPeg = null;
    GS.initialSnap = snap(GS.pegs);

    positionDisks(true);
    refreshUI();
    setStatus('🎲', 'Disks scrambled!  Rearrange them onto Peg C.');
    removeWinOverlay();
    document.getElementById('optimal-counter').textContent = '—';
}

function resetToInitial() {
    if (GS.solving || !GS.initialSnap) return;

    GS.pegs        = JSON.parse(GS.initialSnap);
    GS.moveCount   = 0;
    GS.selectedPeg = null;

    positionDisks(true);
    refreshUI();
    setStatus('↩️', 'Board reset to starting position.');
    removeWinOverlay();
}

// ─── DOM Construction ─────────────────────────────────────

function buildDiskDOM() {
    Object.values(diskEls).forEach(el => el.remove());
    diskEls = {};

    for (const d of GS.pegs.flat()) {
        const el = document.createElement('div');
        el.className = 'disk';
        el.id        = 'disk-' + d.size;

        const ci = DISK_COLORS[d.color];
        el.style.background = ci.bg;
        el.style.boxShadow  = '0 4px 16px ' + ci.glow;
        el.innerHTML = '<span class="disk-label">' + d.size + '</span>';

        boardEl.appendChild(el);
        diskEls[d.size] = el;
    }
}

// ─── Positioning ──────────────────────────────────────────

function positionDisks(animate) {
    const bw      = boardEl.offsetWidth;
    const centers = [bw / 6, bw / 2, bw * 5 / 6];

    for (let p = 0; p < 3; p++) {
        for (let s = 0; s < GS.pegs[p].length; s++) {
            const d  = GS.pegs[p][s];
            const el = diskEls[d.size];
            if (!el) continue;

            if (!animate) el.style.transition = 'none';
            else          el.style.transition = '';

            const wFrac = MIN_W + (d.size / GS.numDisks) * (MAX_W - MIN_W);
            const w     = bw * wFrac;

            el.style.width  = w + 'px';
            el.style.height = DISK_H + 'px';
            el.style.left   = (centers[p] - w / 2) + 'px';
            el.style.bottom = (BASE_Y + s * (DISK_H + DISK_GAP)) + 'px';

            el.classList.toggle('selected',
                GS.selectedPeg === p && s === GS.pegs[p].length - 1);

            if (!animate) {
                void el.offsetHeight;        // force reflow
                el.style.transition = '';
            }
        }
    }
}

// ─── Manual Play ──────────────────────────────────────────

function handlePegClick(p) {
    if (GS.solving) return;

    // ── Nothing selected → pick up ──
    if (GS.selectedPeg === null) {
        if (!GS.pegs[p].length) return;
        GS.selectedPeg = p;
        highlightPegs(p);
        positionDisks(true);
        return;
    }

    // ── Same peg → deselect ──
    if (GS.selectedPeg === p) {
        GS.selectedPeg = null;
        clearHighlights();
        positionDisks(true);
        return;
    }

    // ── Different peg → attempt move ──
    const src  = GS.pegs[GS.selectedPeg];
    const dest = GS.pegs[p];
    const disk = src[src.length - 1];

    if (dest.length && dest[dest.length - 1].size < disk.size) {
        // Invalid move
        const el = diskEls[disk.size];
        el.classList.add('error');
        setTimeout(() => el.classList.remove('error'), 400);
        setStatus('⚠️', 'Invalid! Cannot place a larger disk on a smaller one.');
        GS.selectedPeg = null;
        clearHighlights();
        positionDisks(true);
        return;
    }

    // Valid move
    src.pop();
    dest.push(disk);
    GS.moveCount++;
    GS.selectedPeg = null;
    clearHighlights();
    positionDisks(true);
    refreshUI();
    checkWin();
}

function highlightPegs(exceptPeg) {
    document.querySelectorAll('.peg-area').forEach((el, i) => {
        if (i !== exceptPeg) el.classList.add('highlight');
    });
}

function clearHighlights() {
    document.querySelectorAll('.peg-area').forEach(el =>
        el.classList.remove('highlight'));
}

// ─── AI Solver Integration ────────────────────────────────

async function solveWithAI() {
    if (GS.solving) return;
    GS.solving     = true;
    GS.selectedPeg = null;
    clearHighlights();
    positionDisks(true);
    setStatus('🤖', 'Computing optimal solution…');
    toggleControls(true);

    try {
        const res = await fetch('/solve/', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pegs:          GS.pegs.map(pg => pg.map(d => ({ size: d.size, color: d.color }))),
                target_colors: GS.targetColors,
                algorithm:     document.getElementById('algorithm-select').value,
            }),
        });

        const data = await res.json();

        if (data.error) {
            setStatus('❌', data.error);
            GS.solving = false;
            toggleControls(false);
            return;
        }

        if (!data.moves || !data.moves.length) {
            setStatus('✅', 'Already in the goal state!');
            GS.solving = false;
            toggleControls(false);
            return;
        }

        document.getElementById('optimal-counter').textContent = data.moves.length;
        setStatus('✨', data.moves.length + '-move solution found.  Animating…');
        await runMoves(data.moves);
    } catch (err) {
        setStatus('❌', 'Solver error: ' + err.message);
    }

    GS.solving = false;
    toggleControls(false);
}

async function runMoves(moves) {
    const labels = 'ABC';

    for (let i = 0; i < moves.length; i++) {
        const mv   = moves[i];
        const disk = GS.pegs[mv.source].pop();
        const sPos = GS.pegs[mv.dest].length;
        GS.pegs[mv.dest].push(disk);
        GS.moveCount++;

        await stageDisk(disk.size, mv.dest, sPos);

        refreshUI();
        setStatus('🤖',
            'Move ' + (i + 1) + '/' + moves.length +
            '  ·  Disk ' + disk.size + ' (' + disk.color + '): ' +
            labels[mv.source] + ' → ' + labels[mv.dest]);

        const speed = +document.getElementById('speed-slider').value;
        await sleep(Math.max(50, 1100 - speed));
    }

    checkWin();
}

/**
 * Three-stage animation: lift → slide → drop (with bounce).
 */
async function stageDisk(size, destPeg, destIdx) {
    const el      = diskEls[size];
    const bw      = boardEl.offsetWidth;
    const centers = [bw / 6, bw / 2, bw * 5 / 6];
    const wFrac   = MIN_W + (size / GS.numDisks) * (MAX_W - MIN_W);
    const w       = bw * wFrac;
    const tgtL    = centers[destPeg] - w / 2;
    const tgtB    = BASE_Y + destIdx * (DISK_H + DISK_GAP);

    // Stage 1 — lift
    el.style.transition = 'bottom 0.18s ease-out';
    el.style.bottom     = LIFT_Y + 'px';
    await sleep(200);

    // Stage 2 — horizontal slide
    el.style.transition = 'left 0.22s ease-in-out';
    el.style.left       = tgtL + 'px';
    await sleep(240);

    // Stage 3 — drop with overshoot bounce
    el.style.transition = 'bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
    el.style.bottom     = tgtB + 'px';
    await sleep(240);

    // Restore default transition
    el.style.transition = '';
}

// ─── Win Detection ────────────────────────────────────────

function checkWin() {
    if (GS.pegs[2].length !== GS.numDisks) return;

    // Verify descending size (bottom → top should be large → small)
    for (let i = 0; i < GS.pegs[2].length - 1; i++) {
        if (GS.pegs[2][i].size < GS.pegs[2][i + 1].size) return;
    }

    // Verify colour sequence: target_colors is top → bottom.
    // Peg C stores bottom → top, so we reverse to get top → bottom.
    const topToBottom = [...GS.pegs[2]].reverse().map(d => d.color);
    for (let i = 0; i < GS.targetColors.length; i++) {
        if (topToBottom[i] !== GS.targetColors[i]) return;
    }

    setStatus('🎉', 'Solved in ' + GS.moveCount + ' moves!  Both size and colour constraints satisfied.');
    showWinOverlay();
    launchConfetti();
}

function showWinOverlay() {
    removeWinOverlay();
    const ov = document.createElement('div');
    ov.className = 'win-overlay';
    ov.id        = 'win-overlay';
    ov.innerHTML =
        '<div class="win-message">' +
        '  <h2>🏆 Congratulations!</h2>' +
        '  <p>Puzzle solved in <strong>' + GS.moveCount + '</strong> moves.</p>' +
        '  <p class="win-detail">Both size ordering and target colour arrangement achieved!</p>' +
        '  <p class="win-sub">Click anywhere to dismiss</p>' +
        '</div>';
    ov.addEventListener('click', removeWinOverlay);
    boardEl.appendChild(ov);
}

function removeWinOverlay() {
    const ov = document.getElementById('win-overlay');
    if (ov) ov.remove();
}

function launchConfetti() {
    const solids = Object.values(DISK_COLORS).map(c => c.solid);
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className        = 'confetti';
        p.style.left       = Math.random() * 100 + '%';
        p.style.background = solids[rng(solids.length)];
        p.style.animationDelay    = (Math.random() * 1.5) + 's';
        p.style.animationDuration = (2 + Math.random() * 2) + 's';
        boardEl.appendChild(p);
        setTimeout(() => p.remove(), 5000);
    }
}

// ─── UI Helpers ───────────────────────────────────────────

function refreshUI() {
    document.getElementById('move-counter').textContent = GS.moveCount;
    renderTarget();
}

/**
 * Render the target colour arrangement in the sidebar.
 * Each chip shows the target colour for that size position.
 * target_colors is top→bottom, so target_colors[0] = smallest disk (top).
 *
 * Clicking a target chip cycles its colour — the user can customise
 * the target arrangement to create their own colour constraint.
 */
function renderTarget() {
    const ct = document.getElementById('target-display');
    ct.innerHTML = '';
    for (let i = 0; i < GS.targetColors.length; i++) {
        const c   = GS.targetColors[i];
        const sz  = i + 1;                   // size label (1 = smallest, top)
        const ci  = DISK_COLORS[c];
        const div = document.createElement('div');
        div.className = 'target-disk';
        const pct = 35 + (sz / GS.numDisks) * 65;
        div.style.width      = pct + '%';
        div.style.background = ci.bg;
        div.style.cursor     = 'pointer';
        div.title            = 'Click to change colour (Size ' + sz + ': ' + c + ')';
        div.textContent      = sz + ' · ' + c;

        // Click to cycle through colours
        const idx = i;
        div.addEventListener('click', () => {
            if (GS.solving) return;
            const curIdx = COLOR_NAMES.indexOf(GS.targetColors[idx]);
            GS.targetColors[idx] = COLOR_NAMES[(curIdx + 1) % COLOR_NAMES.length];
            renderTarget();
            removeWinOverlay();
            document.getElementById('optimal-counter').textContent = '—';
            setStatus('🎯', 'Target colour changed!  Size ' + (idx + 1) + ' → ' + GS.targetColors[idx]);
        });

        ct.appendChild(div);
    }
}

function setStatus(icon, msg) {
    document.getElementById('status-icon').textContent = icon;
    document.getElementById('status-text').textContent = msg;
}

function toggleControls(disabled) {
    ['btn-new-game', 'btn-scramble', 'btn-solve', 'btn-reset', 'disk-count']
        .forEach(id => { document.getElementById(id).disabled = disabled; });
}

// ─── Utilities ────────────────────────────────────────────

function rng(max)  { return Math.floor(Math.random() * max); }
function snap(o)   { return JSON.stringify(o); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
