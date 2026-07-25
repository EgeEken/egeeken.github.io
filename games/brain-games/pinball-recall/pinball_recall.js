const MODE = document.body.dataset.mode || 'standard';
const isCustomMode = MODE === 'custom';
const isHardMode = MODE === 'hard';

const STANDARD_REVEAL_MS = 3000;
const STANDARD_STRIKES = 3;
const HARD_STRIKES = 1;
const FEEDBACK_PAUSE_MS = 1250;
const GENERATION_ATTEMPTS = 600;

// Thirty distinct rounds. Wall count rises on every level while board sizes
// move from 3 × 3 to 8 × 8 and finish at 50% occupancy.
const LEVEL_PLAN = [
    { gridSize: 3, wallCount: 2 },
    { gridSize: 3, wallCount: 3 },
    { gridSize: 3, wallCount: 4 },
    { gridSize: 4, wallCount: 5 },
    { gridSize: 4, wallCount: 6 },
    { gridSize: 4, wallCount: 7 },
    { gridSize: 5, wallCount: 8 },
    { gridSize: 5, wallCount: 9 },
    { gridSize: 5, wallCount: 10 },
    { gridSize: 5, wallCount: 11 },
    { gridSize: 5, wallCount: 12 },
    { gridSize: 6, wallCount: 13 },
    { gridSize: 6, wallCount: 14 },
    { gridSize: 6, wallCount: 15 },
    { gridSize: 6, wallCount: 16 },
    { gridSize: 6, wallCount: 17 },
    { gridSize: 6, wallCount: 18 },
    { gridSize: 7, wallCount: 19 },
    { gridSize: 7, wallCount: 20 },
    { gridSize: 7, wallCount: 21 },
    { gridSize: 7, wallCount: 22 },
    { gridSize: 7, wallCount: 23 },
    { gridSize: 7, wallCount: 24 },
    { gridSize: 8, wallCount: 25 },
    { gridSize: 8, wallCount: 26 },
    { gridSize: 8, wallCount: 27 },
    { gridSize: 8, wallCount: 28 },
    { gridSize: 8, wallCount: 29 },
    { gridSize: 8, wallCount: 30 },
    { gridSize: 8, wallCount: 32 }
];
const MAX_LEVEL = LEVEL_PLAN.length;

const DIRECTIONS = {
    up: { row: -1, col: 0 },
    right: { row: 0, col: 1 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 }
};

const REFLECTIONS = {
    slash: { up: 'right', right: 'up', down: 'left', left: 'down' },
    backslash: { up: 'left', left: 'up', down: 'right', right: 'down' }
};

const LAUNCH_ARROWS = {
    top: '↓',
    right: '←',
    bottom: '↑',
    left: '→'
};

const boardShellEl = document.getElementById('pinball-board-shell');
const gridEl = document.getElementById('pinball-grid');
const topPortsEl = document.getElementById('top-ports');
const rightPortsEl = document.getElementById('right-ports');
const bottomPortsEl = document.getElementById('bottom-ports');
const leftPortsEl = document.getElementById('left-ports');
const statusLineEl = document.getElementById('status-line');
const strikeDisplayEl = document.getElementById('strike-display');
const restartButtonEl = document.getElementById('restart-button');
const levelLabelEl = document.getElementById('level-label');
const configLabelEl = document.getElementById('config-label');
const bestScoreEl = document.getElementById('best-score');
const levelProgressEl = document.getElementById('level-progress');
const customScoreEl = document.getElementById('custom-score');

const resultsModalEl = document.getElementById('results-modal');
const resultsTextEl = document.getElementById('results-text');
const copyShareButtonEl = document.getElementById('copy-share');
const closeResultsButtonEl = document.getElementById('close-results');

const trajectoryLayerEl = document.getElementById('trajectory-layer');
const trajectoryGuideEl = document.getElementById('trajectory-guide');
const trajectoryPathEl = document.getElementById('trajectory-path');
const trailMaskPathEl = document.getElementById('trail-mask-path');
const pinballDotEl = document.getElementById('pinball-dot');
const trailMaskEl = document.getElementById('trail-reveal-mask');

const levelPresetInput = document.getElementById('preset-level');
const levelPresetValueEl = document.getElementById('preset-level-value');
const gridSizeInput = document.getElementById('grid-size');
const wallCountInput = document.getElementById('wall-count');
const revealTimeInput = document.getElementById('reveal-time');
const strikeLimitInput = document.getElementById('strike-limit');
const gridSizeValueEl = document.getElementById('grid-size-value');
const wallCountValueEl = document.getElementById('wall-count-value');
const revealTimeValueEl = document.getElementById('reveal-time-value');
const strikeLimitValueEl = document.getElementById('strike-limit-value');

let level = 1;
let gridSize = 3;
let wallCount = 2;
let revealTimeMs = STANDARD_REVEAL_MS;
let strikeLimit = STANDARD_STRIKES;
let strikes = 0;
let solvedRounds = 0;
let walls = new Map();
let launch = null;
let solution = null;
let selectedExit = null;
let phase = 'idle';
let revealTimer = null;
let nextRoundTimer = null;
let animationFrameId = null;
let animationToken = 0;
let lastShareText = '';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function samePort(a, b) {
    return Boolean(a && b && a.side === b.side && a.index === b.index);
}

function wallKey(row, col) {
    return `${row},${col}`;
}

function formatSeconds(milliseconds) {
    const seconds = milliseconds / 1000;
    return `${seconds.toFixed(seconds % 1 === 0 ? 1 : 2)} s`;
}

function getLevelConfig(targetLevel) {
    const clampedLevel = clamp(Math.round(targetLevel), 1, MAX_LEVEL);
    const levelIndex = clampedLevel - 1;
    const planned = LEVEL_PLAN[levelIndex];
    const hardReveal = Math.round(2000 - (Math.min(levelIndex, 15) * (1000 / 15)));

    return {
        ...planned,
        revealTimeMs: isHardMode ? hardReveal : STANDARD_REVEAL_MS,
        strikeLimit: isHardMode ? HARD_STRIKES : STANDARD_STRIKES
    };
}

function syncWallCountRange(size, preferredValue = null) {
    if (!wallCountInput) {
        return 1;
    }

    const max = size * size;
    wallCountInput.min = '1';
    wallCountInput.max = String(max);
    wallCountInput.step = '1';

    let value = preferredValue === null ? Number(wallCountInput.value) : Number(preferredValue);
    if (!Number.isFinite(value)) {
        value = Math.max(1, Math.round(max * 0.4));
    }
    value = clamp(Math.round(value), 1, max);
    wallCountInput.value = String(value);
    return value;
}

function getCustomConfig() {
    const size = Number(gridSizeInput.value);
    return {
        gridSize: size,
        wallCount: syncWallCountRange(size),
        revealTimeMs: Number(revealTimeInput.value),
        strikeLimit: Number(strikeLimitInput.value)
    };
}

function updateCustomControlLabels() {
    if (!isCustomMode) {
        return;
    }

    const size = Number(gridSizeInput.value);
    const count = syncWallCountRange(size);
    const percent = Math.round((count / (size * size)) * 100);

    gridSizeValueEl.textContent = `${size} × ${size}`;
    wallCountValueEl.textContent = `${count} ${count === 1 ? 'wall' : 'walls'} (${percent}%)`;
    revealTimeValueEl.textContent = formatSeconds(Number(revealTimeInput.value));
    strikeLimitValueEl.textContent = strikeLimitInput.value;
    levelPresetValueEl.textContent = levelPresetInput.value;
}

function applyLevelPreset() {
    const preset = getLevelConfig(Number(levelPresetInput.value));
    gridSizeInput.value = String(preset.gridSize);
    syncWallCountRange(preset.gridSize, preset.wallCount);
    revealTimeInput.value = String(STANDARD_REVEAL_MS);
    updateCustomControlLabels();
}

function applyConfig() {
    const config = isCustomMode ? getCustomConfig() : getLevelConfig(level);
    gridSize = config.gridSize;
    wallCount = config.wallCount;
    revealTimeMs = config.revealTimeMs;
    strikeLimit = config.strikeLimit;

    if (levelLabelEl) {
        levelLabelEl.textContent = `Level ${level} / ${MAX_LEVEL}`;
    }
    if (configLabelEl) {
        configLabelEl.textContent = `${gridSize} × ${gridSize} · ${wallCount} ${wallCount === 1 ? 'wall' : 'walls'} · ${formatSeconds(revealTimeMs)}`;
    }
    if (levelProgressEl) {
        levelProgressEl.style.width = `${(clamp(level, 1, MAX_LEVEL) / MAX_LEVEL) * 100}%`;
    }
    updateStrikeDisplay();
    updateBestScoreDisplay();
}

function getStorageKey() {
    return `pinballRecallBest-${MODE}`;
}

function getBestScore() {
    if (isCustomMode) {
        return 0;
    }
    try {
        return Number(localStorage.getItem(getStorageKey())) || 0;
    } catch (error) {
        return 0;
    }
}

function saveBestScore(score) {
    if (isCustomMode || score <= getBestScore()) {
        return;
    }
    try {
        localStorage.setItem(getStorageKey(), String(score));
    } catch (error) {
        // The game remains playable when local storage is unavailable.
    }
}

function updateBestScoreDisplay() {
    if (bestScoreEl) {
        bestScoreEl.textContent = `Best score: ${getBestScore()}`;
    }
}

function updateStrikeDisplay() {
    if (strikeDisplayEl) {
        strikeDisplayEl.textContent = `Strikes: ${strikes} / ${strikeLimit}`;
    }
    if (customScoreEl) {
        customScoreEl.textContent = `Solved: ${solvedRounds}`;
    }
}

function clearTimersAndAnimation() {
    if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
    }
    if (nextRoundTimer) {
        clearTimeout(nextRoundTimer);
        nextRoundTimer = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    animationToken += 1;
}

function resetTrajectory() {
    trajectoryGuideEl.setAttribute('d', '');
    trajectoryPathEl.setAttribute('d', '');
    trailMaskPathEl.setAttribute('d', '');
    trailMaskPathEl.style.strokeDasharray = '';
    trajectoryPathEl.style.opacity = '0';
    pinballDotEl.style.opacity = '0';
}

function createPortButton(side, index) {
    const slot = document.createElement('div');
    slot.className = 'port-slot';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'port-button';
    button.dataset.side = side;
    button.dataset.index = String(index);
    button.disabled = true;
    button.setAttribute('aria-label', `${side} port ${index + 1}`);
    button.addEventListener('click', onPortClick);

    slot.appendChild(button);
    return slot;
}

function buildBoard() {
    gridEl.innerHTML = '';
    topPortsEl.innerHTML = '';
    rightPortsEl.innerHTML = '';
    bottomPortsEl.innerHTML = '';
    leftPortsEl.innerHTML = '';

    const trackTemplate = `repeat(${gridSize}, minmax(0, 1fr))`;
    gridEl.style.gridTemplateColumns = trackTemplate;
    gridEl.style.gridTemplateRows = trackTemplate;
    topPortsEl.style.gridTemplateColumns = trackTemplate;
    bottomPortsEl.style.gridTemplateColumns = trackTemplate;
    leftPortsEl.style.gridTemplateRows = trackTemplate;
    rightPortsEl.style.gridTemplateRows = trackTemplate;

    for (let index = 0; index < gridSize; index += 1) {
        topPortsEl.appendChild(createPortButton('top', index));
        rightPortsEl.appendChild(createPortButton('right', index));
        bottomPortsEl.appendChild(createPortButton('bottom', index));
        leftPortsEl.appendChild(createPortButton('left', index));
    }

    for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
            const cell = document.createElement('div');
            cell.className = 'pinball-cell';
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            gridEl.appendChild(cell);
        }
    }
}

function generateWalls() {
    const positions = shuffle(Array.from({ length: gridSize * gridSize }, (_, index) => index));
    const nextWalls = new Map();

    positions.slice(0, wallCount).forEach((position) => {
        const row = Math.floor(position / gridSize);
        const col = position % gridSize;
        nextWalls.set(wallKey(row, col), Math.random() < 0.5 ? 'slash' : 'backslash');
    });
    return nextWalls;
}

function getInitialState(port) {
    if (port.side === 'top') {
        return { row: 0, col: port.index, direction: 'down' };
    }
    if (port.side === 'right') {
        return { row: port.index, col: gridSize - 1, direction: 'left' };
    }
    if (port.side === 'bottom') {
        return { row: gridSize - 1, col: port.index, direction: 'up' };
    }
    return { row: port.index, col: 0, direction: 'right' };
}

function getExitPort(row, col) {
    if (row < 0) {
        return { side: 'top', index: col };
    }
    if (col >= gridSize) {
        return { side: 'right', index: row };
    }
    if (row >= gridSize) {
        return { side: 'bottom', index: col };
    }
    return { side: 'left', index: row };
}

function tracePath(startPort, wallMap) {
    let { row, col, direction } = getInitialState(startPort);
    const visitedStates = new Set();
    const cells = [];
    let bounceCount = 0;

    while (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
        const stateKey = `${row},${col},${direction}`;
        if (visitedStates.has(stateKey)) {
            return { exited: false, looped: true, cells, bounceCount };
        }
        visitedStates.add(stateKey);
        cells.push({ row, col });

        const orientation = wallMap.get(wallKey(row, col));
        if (orientation) {
            direction = REFLECTIONS[orientation][direction];
            bounceCount += 1;
        }

        const delta = DIRECTIONS[direction];
        row += delta.row;
        col += delta.col;
    }

    return {
        exited: true,
        looped: false,
        cells,
        bounceCount,
        exit: getExitPort(row, col)
    };
}

function launchLineContainsWall(port, wallMap) {
    for (const key of wallMap.keys()) {
        const [row, col] = key.split(',').map(Number);
        if ((port.side === 'left' || port.side === 'right') && row === port.index) {
            return true;
        }
        if ((port.side === 'top' || port.side === 'bottom') && col === port.index) {
            return true;
        }
    }
    return false;
}

function getAllPorts() {
    const ports = [];
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
        for (let index = 0; index < gridSize; index += 1) {
            ports.push({ side, index });
        }
    });
    return ports;
}

function buildFallbackPuzzle() {
    const positions = Array.from({ length: gridSize * gridSize }, (_, index) => index);
    walls = new Map([[wallKey(0, 0), 'slash']]);
    shuffle(positions.filter((position) => position !== 0))
        .slice(0, Math.max(0, wallCount - 1))
        .forEach((position) => {
            const row = Math.floor(position / gridSize);
            const col = position % gridSize;
            walls.set(wallKey(row, col), Math.random() < 0.5 ? 'slash' : 'backslash');
        });
    launch = { side: 'left', index: 0 };
    solution = tracePath(launch, walls);
}

function generatePuzzle() {
    for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
        const candidateWalls = generateWalls();
        const validLaunches = getAllPorts().filter((candidateLaunch) => {
            if (!launchLineContainsWall(candidateLaunch, candidateWalls)) {
                return false;
            }
            const candidateSolution = tracePath(candidateLaunch, candidateWalls);
            return candidateSolution.exited
                && candidateSolution.bounceCount >= 1
                && !samePort(candidateLaunch, candidateSolution.exit);
        });

        if (validLaunches.length > 0) {
            walls = candidateWalls;
            launch = randomItem(validLaunches);
            solution = tracePath(launch, walls);
            return;
        }
    }
    buildFallbackPuzzle();
}

function renderWalls(visible, feedback = false) {
    gridEl.querySelectorAll('.pinball-cell').forEach((cell) => {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const orientation = walls.get(wallKey(row, col));
        cell.innerHTML = '';

        if (!orientation) {
            return;
        }

        const wall = document.createElement('span');
        wall.className = `wall ${orientation}`;
        wall.classList.toggle('visible', visible);
        wall.classList.toggle('feedback', feedback);
        cell.appendChild(wall);
    });
}

function setPortsEnabled(enabled) {
    document.querySelectorAll('.port-button').forEach((button) => {
        const port = { side: button.dataset.side, index: Number(button.dataset.index) };
        button.disabled = !enabled || samePort(port, launch);
    });
}

function getPortButton(port) {
    return document.querySelector(`.port-button[data-side="${port.side}"][data-index="${port.index}"]`);
}

function clearPortStates() {
    document.querySelectorAll('.port-button').forEach((button) => {
        button.classList.remove('launch', 'predicted', 'correct-exit', 'wrong-exit');
        button.textContent = '';
    });
}

function revealLaunch() {
    const launchButton = getPortButton(launch);
    launchButton.classList.add('launch');
    launchButton.textContent = LAUNCH_ARROWS[launch.side];
    launchButton.setAttribute('aria-label', `Ball launches from ${launch.side} port ${launch.index + 1}`);
}

function startRound() {
    clearTimersAndAnimation();
    applyConfig();
    phase = 'memorize';
    selectedExit = null;
    buildBoard();
    generatePuzzle();
    clearPortStates();
    resetTrajectory();
    renderWalls(true);
    setPortsEnabled(false);
    statusLineEl.textContent = `Memorize the ${wallCount} ${wallCount === 1 ? 'wall' : 'walls'}...`;

    revealTimer = setTimeout(() => {
        renderWalls(false);
        revealLaunch();
        setPortsEnabled(true);
        phase = 'predict';
        statusLineEl.textContent = 'Where will the ball exit? Click a perimeter port.';
    }, revealTimeMs);
}

function getElementCenter(element, relativeRect) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left - relativeRect.left + (rect.width / 2),
        y: rect.top - relativeRect.top + (rect.height / 2)
    };
}

function getTrajectoryPoints() {
    const shellRect = boardShellEl.getBoundingClientRect();
    const points = [getElementCenter(getPortButton(launch), shellRect)];

    solution.cells.forEach(({ row, col }) => {
        const cell = gridEl.querySelector(`.pinball-cell[data-row="${row}"][data-col="${col}"]`);
        points.push(getElementCenter(cell, shellRect));
    });

    points.push(getElementCenter(getPortButton(solution.exit), shellRect));
    return points;
}

function pointsToPath(points) {
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
}

function animateTrajectory() {
    const currentToken = animationToken;
    const width = boardShellEl.clientWidth;
    const height = boardShellEl.clientHeight;
    const pathData = pointsToPath(getTrajectoryPoints());

    trajectoryLayerEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    trailMaskEl.setAttribute('x', '0');
    trailMaskEl.setAttribute('y', '0');
    trailMaskEl.setAttribute('width', String(width));
    trailMaskEl.setAttribute('height', String(height));
    trajectoryGuideEl.setAttribute('d', pathData);
    trajectoryPathEl.setAttribute('d', pathData);
    trailMaskPathEl.setAttribute('d', pathData);
    trajectoryPathEl.style.opacity = '1';
    pinballDotEl.style.opacity = '1';

    const totalLength = trajectoryGuideEl.getTotalLength();
    const stepCount = Math.max(1, solution.cells.length + 1);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 280 : clamp(650 + (stepCount * 145), 1100, 3900);
    const startTime = performance.now();

    function frame(now) {
        if (currentToken !== animationToken) {
            return;
        }

        const progress = clamp((now - startTime) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        const currentLength = Math.max(0.01, totalLength * eased);
        const point = trajectoryGuideEl.getPointAtLength(currentLength);

        trailMaskPathEl.style.strokeDasharray = `${currentLength} ${Math.max(0.01, totalLength - currentLength)}`;
        pinballDotEl.setAttribute('cx', point.x);
        pinballDotEl.setAttribute('cy', point.y);

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(frame);
        } else {
            animationFrameId = null;
            finishPrediction();
        }
    }

    animationFrameId = requestAnimationFrame(frame);
}

function onPortClick(event) {
    if (phase !== 'predict') {
        return;
    }

    selectedExit = {
        side: event.currentTarget.dataset.side,
        index: Number(event.currentTarget.dataset.index)
    };
    phase = 'simulate';
    setPortsEnabled(false);
    event.currentTarget.classList.add('predicted');
    renderWalls(true, true);
    statusLineEl.textContent = 'Tracing the ball...';
    requestAnimationFrame(animateTrajectory);
}

function finishPrediction() {
    const selectedButton = getPortButton(selectedExit);
    const actualButton = getPortButton(solution.exit);
    const correct = samePort(selectedExit, solution.exit);

    selectedButton.classList.remove('predicted');
    if (correct) {
        actualButton.classList.add('correct-exit');
        solvedRounds += 1;
        if (!isCustomMode) {
            saveBestScore(level);
        }
        updateStrikeDisplay();
        statusLineEl.textContent = `Correct — ${solution.bounceCount} ${solution.bounceCount === 1 ? 'bounce' : 'bounces'}.`;

        if (!isCustomMode && level >= MAX_LEVEL) {
            phase = 'gameover';
            showResults(true);
            return;
        }

        if (!isCustomMode) {
            level += 1;
        }
        nextRoundTimer = setTimeout(startRound, FEEDBACK_PAUSE_MS);
        return;
    }

    selectedButton.classList.add('wrong-exit');
    actualButton.classList.add('correct-exit');
    strikes += 1;
    updateStrikeDisplay();
    statusLineEl.textContent = `Not quite — the ball exited at the highlighted port after ${solution.bounceCount} ${solution.bounceCount === 1 ? 'bounce' : 'bounces'}.`;

    if (strikes >= strikeLimit) {
        phase = 'gameover';
        nextRoundTimer = setTimeout(() => showResults(false), 700);
    } else {
        nextRoundTimer = setTimeout(startRound, FEEDBACK_PAUSE_MS + 350);
    }
}

function buildShareText(completedAllLevels = false) {
    const modeLabel = isHardMode ? 'Pinball Recall (Hard Mode)' : (isCustomMode ? 'Pinball Recall (Custom)' : 'Pinball Recall');
    const scoreLine = isCustomMode
        ? `Solved: ${solvedRounds}`
        : (completedAllLevels ? `Cleared all ${MAX_LEVEL} levels` : `Score: ${Math.max(0, level - 1)}`);
    const shareUrl = isHardMode
        ? 'https://egeeken.github.io/games/brain-games/pinball-recall/pinball-recall-hard.html'
        : (isCustomMode
            ? 'https://egeeken.github.io/games/brain-games/pinball-recall/pinball-recall-custom.html'
            : 'https://egeeken.github.io/games/brain-games/pinball-recall/pinball-recall.html');
    return `${modeLabel} - ${scoreLine}\n${shareUrl}`;
}

function showResults(completedAllLevels = false) {
    lastShareText = buildShareText(completedAllLevels);
    resultsTextEl.textContent = lastShareText;
    resultsModalEl.style.display = 'flex';
    statusLineEl.textContent = completedAllLevels
        ? `You cleared all ${MAX_LEVEL} levels.`
        : 'Game over. Press restart to try again.';
}

function closeResults() {
    resultsModalEl.style.display = 'none';
}

function copyShareText() {
    if (!lastShareText) {
        return;
    }
    navigator.clipboard.writeText(lastShareText).then(() => {
        statusLineEl.textContent = 'Share text copied.';
    }).catch(() => {
        statusLineEl.textContent = 'Copy failed. Select the text manually.';
    });
}

function resetGame() {
    clearTimersAndAnimation();
    closeResults();
    level = 1;
    strikes = 0;
    solvedRounds = 0;
    updateStrikeDisplay();
    startRound();
}

if (isCustomMode) {
    levelPresetInput.addEventListener('input', applyLevelPreset);
    gridSizeInput.addEventListener('input', updateCustomControlLabels);
    wallCountInput.addEventListener('input', updateCustomControlLabels);
    revealTimeInput.addEventListener('input', updateCustomControlLabels);
    strikeLimitInput.addEventListener('input', updateCustomControlLabels);
    applyLevelPreset();
}

restartButtonEl.addEventListener('click', resetGame);
closeResultsButtonEl.addEventListener('click', closeResults);
copyShareButtonEl.addEventListener('click', copyShareText);
resultsModalEl.addEventListener('click', (event) => {
    if (event.target === resultsModalEl) {
        closeResults();
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeResults();
    }
});

updateCustomControlLabels();
resetGame();
