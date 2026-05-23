const MODE = document.body.dataset.mode || 'standard';
const isCustomMode = MODE === 'custom';

const MOVE_ANIMATION_MS = 300;
const INPUT_BUFFER_MS = 100;
const MOVE_PER_SECOND = 1000 / MOVE_ANIMATION_MS;
const START_ROTATION_DELAY_MS = 0;
const ROTATION_EXTRA_WAIT_MS = 2000;
const ROTATION_BASE_DURATION_MS = 450;
const ROTATION_DURATION_RANGE_MS = 350;

const gridEl = document.getElementById('maze-grid');
const rotationFrameEl = document.getElementById('maze-rotation-frame');
const statusLineEl = document.getElementById('status-line');
const timerDisplayEl = document.getElementById('timer-display');
const timerBarFillEl = document.getElementById('timer-bar-fill');
const restartButtonEl = document.getElementById('restart-button');
const levelLabelEl = document.getElementById('level-label');

const resultsModal = document.getElementById('results-modal');
const resultsTextEl = document.getElementById('results-text');
const copyShareButtonEl = document.getElementById('copy-share');
const closeResultsButtonEl = document.getElementById('close-results');

const levelPresetInput = document.getElementById('preset-level');
const levelPresetValueEl = document.getElementById('preset-level-value');
const mazeSizeInput = document.getElementById('maze-size');
const rotationTimeMinInput = document.getElementById('rotation-time-min');
const rotationIntensityMinInput = document.getElementById('rotation-intensity-min');
const timerLeniencyInput = document.getElementById('timer-leniency');

const mazeSizeValueEl = document.getElementById('maze-size-value');
const rotationTimeMinValueEl = document.getElementById('rotation-time-min-value');
const rotationIntensityMinValueEl = document.getElementById('rotation-intensity-min-value');
const timerLeniencyValueEl = document.getElementById('timer-leniency-value');

const DIRS = {
    U: { dr: -1, dc: 0, wall: 'U', opposite: 'D' },
    D: { dr: 1, dc: 0, wall: 'D', opposite: 'U' },
    L: { dr: 0, dc: -1, wall: 'L', opposite: 'R' },
    R: { dr: 0, dc: 1, wall: 'R', opposite: 'L' }
};

const KEY_TO_DIR = {
    ArrowUp: 'U',
    ArrowDown: 'D',
    ArrowLeft: 'L',
    ArrowRight: 'R'
};

let level = 1;
let mazeSize = 6;
let rotationTimeMin = 1;
let rotationIntensityMin = 30;
let timerLeniency = 30;

let maze = [];
let cellEls = [];
let mousePos = null;
let cheesePos = null;
let shortestPathLen = 0;
let isFrozen = false;
let rotationAngle = 0;
let isMoving = false;
let moveStartAt = 0;
let moveTimeout = null;
let queuedDir = null;
let cellPixelSize = 0;

let rotationStartTimeout = null;
let rotationHoldTimeout = null;
let rotationTransitionTimeout = null;
let timerInterval = null;
let timerEndAt = 0;
let timerTotalSeconds = 0;

const mouseEl = createMouseElement();
const cheeseEl = document.createElement('div');
cheeseEl.className = 'cheese';

function readNumber(input, fallback) {
    if (!input) {
        return fallback;
    }
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
}

function getPresetConfig(presetLevel) {
    const clamped = Math.max(0, Math.min(30, presetLevel));
    const size = 5 + Math.min(4, Math.floor(clamped / 6));
    const timeMin = Math.max(0, 1.4 - (clamped / 30) * 1.2);
    const intensityScale = Math.pow(clamped / 30, 1.6);
    const intensityMin = Math.round(10 + intensityScale * 140);
    return { mazeSize: size, rotationTimeMin: timeMin, rotationIntensityMin: intensityMin };
}

function getLevelLeniency(lvl) {
    const levelValue = Math.max(0, Math.min(30, lvl));
    if (levelValue <= 1) {
        return 100;
    }
    if (levelValue <= 6) {
        const t = (levelValue - 1) / 5;
        return 100 + (40 - 100) * t;
    }
    if (levelValue <= 15) {
        const t = (levelValue - 6) / 9;
        return 40 + (30 - 40) * t;
    }
    if (levelValue >= 30) {
        return 10;
    }
    const t = (levelValue - 15) / 15;
    return 30 + (10 - 30) * t;
}

function getCustomConfig() {
    return {
        mazeSize: readNumber(mazeSizeInput, 6),
        rotationTimeMin: readNumber(rotationTimeMinInput, 1),
        rotationIntensityMin: readNumber(rotationIntensityMinInput, 30),
        timerLeniency: readNumber(timerLeniencyInput, 30)
    };
}

function applyConfig() {
    if (isCustomMode) {
        const config = getCustomConfig();
        mazeSize = config.mazeSize;
        rotationTimeMin = config.rotationTimeMin;
        rotationIntensityMin = config.rotationIntensityMin;
        timerLeniency = config.timerLeniency;
    } else {
        const config = getPresetConfig(level);
        mazeSize = config.mazeSize;
        rotationTimeMin = config.rotationTimeMin;
        rotationIntensityMin = config.rotationIntensityMin;
        timerLeniency = getLevelLeniency(level);
    }

    if (levelLabelEl) {
        levelLabelEl.textContent = `Level ${level}`;
    }
}

function updateControlLabels() {
    if (!isCustomMode) {
        return;
    }

    const size = readNumber(mazeSizeInput, 6);
    const timeMin = readNumber(rotationTimeMinInput, 1);
    const intensityMin = readNumber(rotationIntensityMinInput, 30);
    const leniency = readNumber(timerLeniencyInput, 30);

    if (mazeSizeValueEl) {
        mazeSizeValueEl.textContent = `${size} × ${size}`;
    }
    if (rotationTimeMinValueEl) {
        rotationTimeMinValueEl.textContent = `${timeMin.toFixed(1)} s`;
    }
    if (rotationIntensityMinValueEl) {
        rotationIntensityMinValueEl.textContent = `${Math.round(intensityMin)}°`;
    }
    if (timerLeniencyValueEl) {
        timerLeniencyValueEl.textContent = `${Math.round(leniency)}%`;
    }
    if (levelPresetValueEl && levelPresetInput) {
        levelPresetValueEl.textContent = levelPresetInput.value;
    }
}

function createMouseElement() {
    const mouse = document.createElement('div');
    mouse.className = 'mouse face-up';
    const leftEye = document.createElement('span');
    leftEye.className = 'eye left';
    const rightEye = document.createElement('span');
    rightEye.className = 'eye right';
    mouse.append(leftEye, rightEye);
    return mouse;
}

function setMouseFacing(dir) {
    mouseEl.classList.remove('face-up', 'face-down', 'face-left', 'face-right');
    switch (dir) {
        case 'D':
            mouseEl.classList.add('face-down');
            break;
        case 'L':
            mouseEl.classList.add('face-left');
            break;
        case 'R':
            mouseEl.classList.add('face-right');
            break;
        default:
            mouseEl.classList.add('face-up');
            break;
    }
}

function setMouseMood(mood) {
    mouseEl.classList.toggle('dead', mood === 'dead');
    mouseEl.classList.toggle('happy', mood === 'happy');
}

function buildGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${mazeSize}, minmax(0, 1fr))`;
    cellEls = [];

    for (let row = 0; row < mazeSize; row += 1) {
        for (let col = 0; col < mazeSize; col += 1) {
            const cell = document.createElement('div');
            cell.className = 'maze-cell';
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            const walls = maze[row][col].walls;
            if (walls.U) {
                cell.classList.add('wall-top');
            }
            if (walls.R) {
                cell.classList.add('wall-right');
            }
            if (walls.D) {
                cell.classList.add('wall-bottom');
            }
            if (walls.L) {
                cell.classList.add('wall-left');
            }
            gridEl.appendChild(cell);
            cellEls.push(cell);
        }
    }
}

function getCellEl(position) {
    const index = position.row * mazeSize + position.col;
    return cellEls[index];
}

function placeMouse() {
    if (mouseEl.parentElement !== gridEl) {
        gridEl.appendChild(mouseEl);
    }
    updateMouseSizing();
    moveMouseToPosition(mousePos, false);
}

function placeCheese() {
    if (cheeseEl.parentElement) {
        cheeseEl.parentElement.removeChild(cheeseEl);
    }
    if (!cheesePos || mouseEl.classList.contains('happy')) {
        return;
    }
    const cell = getCellEl(cheesePos);
    if (cell) {
        cell.appendChild(cheeseEl);
    }
}

function updateMouseSizing() {
    const width = gridEl.clientWidth || gridEl.getBoundingClientRect().width;
    if (!width) {
        return;
    }
    cellPixelSize = width / mazeSize;
    const mouseSize = cellPixelSize * 0.7;
    mouseEl.style.width = `${mouseSize}px`;
    mouseEl.style.height = `${mouseSize}px`;
}

function moveMouseToPosition(position, animate = true) {
    if (!position) {
        return;
    }
    updateMouseSizing();
    const offset = cellPixelSize * 0.15;
    const x = (position.col * cellPixelSize) + offset;
    const y = (position.row * cellPixelSize) + offset;
    mouseEl.style.transition = animate ? `transform ${MOVE_ANIMATION_MS}ms ease-in-out` : 'transform 0ms';
    mouseEl.style.transform = `translate(${x}px, ${y}px)`;
}

function resetRotationInstant() {
    rotationAngle = 0;
    rotationFrameEl.style.transition = 'transform 0ms';
    rotationFrameEl.style.transform = 'rotate(0deg)';
}

function rotateToZero(durationMs = 500) {
    rotationAngle = 0;
    rotationFrameEl.style.transition = `transform ${durationMs}ms ease-in-out`;
    rotationFrameEl.style.transform = 'rotate(0deg)';
}

function clearRotationTimers() {
    if (rotationStartTimeout) {
        clearTimeout(rotationStartTimeout);
        rotationStartTimeout = null;
    }
    if (rotationHoldTimeout) {
        clearTimeout(rotationHoldTimeout);
        rotationHoldTimeout = null;
    }
    if (rotationTransitionTimeout) {
        clearTimeout(rotationTransitionTimeout);
        rotationTransitionTimeout = null;
    }
}

function scheduleRotation() {
    if (isFrozen) {
        return;
    }
    const waitMs = (rotationTimeMin * 1000) + (Math.random() * ROTATION_EXTRA_WAIT_MS);
    rotationHoldTimeout = setTimeout(() => {
        if (isFrozen) {
            return;
        }
        const magnitude = randomBetween(rotationIntensityMin, 180);
        const direction = Math.random() < 0.5 ? -1 : 1;
        rotationAngle += direction * magnitude;
        const duration = ROTATION_BASE_DURATION_MS + (magnitude / 180) * ROTATION_DURATION_RANGE_MS;
        rotationFrameEl.style.transition = `transform ${Math.round(duration)}ms ease-in-out`;
        rotationFrameEl.style.transform = `rotate(${rotationAngle}deg)`;
        rotationTransitionTimeout = setTimeout(scheduleRotation, duration);
    }, waitMs);
}

function startRotationCycle() {
    clearRotationTimers();
    rotationStartTimeout = setTimeout(scheduleRotation, START_ROTATION_DELAY_MS);
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay(seconds) {
    if (!timerDisplayEl) {
        return;
    }
    const clamped = Math.max(0, seconds);
    timerDisplayEl.textContent = `Time: ${clamped.toFixed(1)}s`;
    updateTimerFill(clamped);
}

function updateTimerFill(seconds) {
    if (!timerBarFillEl) {
        return;
    }
    if (timerTotalSeconds <= 0) {
        timerBarFillEl.style.width = seconds <= 0 ? '100%' : '0%';
        return;
    }
    const progress = 1 - (seconds / timerTotalSeconds);
    const percent = Math.max(0, Math.min(1, progress)) * 100;
    timerBarFillEl.style.width = `${percent.toFixed(1)}%`;
}

function startTimer(seconds) {
    clearTimer();
    timerTotalSeconds = Math.max(0, seconds);
    timerEndAt = Date.now() + (seconds * 1000);
    updateTimerDisplay(seconds);
    timerInterval = setInterval(() => {
        const remaining = (timerEndAt - Date.now()) / 1000;
        if (remaining <= 0) {
            updateTimerDisplay(0);
            handleLoss();
            return;
        }
        updateTimerDisplay(remaining);
    }, 100);
}

function startTimerForDistance(distance) {
    const minSeconds = (distance / MOVE_PER_SECOND) + 1;
    const totalSeconds = minSeconds * (1 + (timerLeniency / 100));
    startTimer(totalSeconds);
}

function handleLoss() {
    if (isFrozen) {
        return;
    }
    isFrozen = true;
    isMoving = false;
    queuedDir = null;
    if (moveTimeout) {
        clearTimeout(moveTimeout);
        moveTimeout = null;
    }
    clearTimer();
    clearRotationTimers();
    rotateToZero();
    setMouseMood('dead');
    placeMouse();
    statusLineEl.textContent = 'Game over. Press restart to try again.';
    showResults();
}

function handleWin() {
    if (isFrozen) {
        return;
    }
    isFrozen = true;
    isMoving = false;
    queuedDir = null;
    if (moveTimeout) {
        clearTimeout(moveTimeout);
        moveTimeout = null;
    }
    clearTimer();
    clearRotationTimers();
    rotateToZero();
    setMouseMood('happy');
    placeMouse();
    if (cheeseEl.parentElement) {
        cheeseEl.parentElement.removeChild(cheeseEl);
    }
    statusLineEl.textContent = 'Nice! Next maze loading...';

    setTimeout(() => {
        if (!isCustomMode) {
            level += 1;
        }
        startLevel();
    }, 800);
}

function showResults() {
    if (isCustomMode || !resultsModal || !resultsTextEl) {
        return;
    }
    const shareUrl = window.location.href.split('#')[0];
    const scoreLabel = `Score: ${level - 1}`;
    const shareText = `Mouse Vertigo - ${scoreLabel}\n${shareUrl}`;
    resultsTextEl.textContent = shareText;
    resultsModal.style.display = 'flex';
}

function closeResults() {
    if (!resultsModal) {
        return;
    }
    resultsModal.style.display = 'none';
}

function copyShareText() {
    if (!resultsTextEl) {
        return;
    }
    const shareText = resultsTextEl.textContent;
    if (!shareText) {
        return;
    }
    navigator.clipboard.writeText(shareText).then(() => {
        statusLineEl.textContent = 'Share text copied!';
    }).catch(() => {
        statusLineEl.textContent = 'Copy failed. Select the text manually.';
    });
}

function attemptMove(dir) {
    if (isFrozen || !mousePos) {
        return;
    }
    setMouseFacing(dir);
    if (isMoving) {
        const remaining = MOVE_ANIMATION_MS - (Date.now() - moveStartAt);
        if (remaining <= INPUT_BUFFER_MS) {
            queuedDir = dir;
        }
        return;
    }
    const cell = maze[mousePos.row][mousePos.col];
    if (cell.walls[dir]) {
        return;
    }
    const next = {
        row: mousePos.row + DIRS[dir].dr,
        col: mousePos.col + DIRS[dir].dc
    };
    mousePos = next;
    isMoving = true;
    moveStartAt = Date.now();
    queuedDir = null;
    moveMouseToPosition(mousePos, true);
    if (moveTimeout) {
        clearTimeout(moveTimeout);
    }
    moveTimeout = setTimeout(() => {
        isMoving = false;
        if (isFrozen) {
            return;
        }
        if (mousePos.row === cheesePos.row && mousePos.col === cheesePos.col) {
            handleWin();
            return;
        }
        if (queuedDir) {
            const nextDir = queuedDir;
            queuedDir = null;
            attemptMove(nextDir);
        }
    }, MOVE_ANIMATION_MS);
}

function onDpadClick(event) {
    const dir = event.currentTarget.dataset.dir;
    if (!dir) {
        return;
    }
    attemptMove(dir);
}

function onKeyDown(event) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
    }
    const dir = KEY_TO_DIR[event.key];
    if (!dir) {
        return;
    }
    event.preventDefault();
    attemptMove(dir);
}

function resetGame() {
    closeResults();
    if (!isCustomMode) {
        level = 1;
    }
    startLevel();
}

function createMaze(size) {
    const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
            walls: { U: true, R: true, D: true, L: true },
            visited: false
        }))
    );

    const startRow = Math.floor(Math.random() * size);
    const startCol = Math.floor(Math.random() * size);
    const stack = [{ row: startRow, col: startCol }];
    cells[startRow][startCol].visited = true;

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];
        for (const key of Object.keys(DIRS)) {
            const nextRow = current.row + DIRS[key].dr;
            const nextCol = current.col + DIRS[key].dc;
            if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) {
                continue;
            }
            if (!cells[nextRow][nextCol].visited) {
                neighbors.push({ row: nextRow, col: nextCol, dir: key });
            }
        }

        if (neighbors.length === 0) {
            stack.pop();
            continue;
        }

        const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
        const currentCell = cells[current.row][current.col];
        const nextCell = cells[pick.row][pick.col];
        currentCell.walls[pick.dir] = false;
        nextCell.walls[DIRS[pick.dir].opposite] = false;
        nextCell.visited = true;
        stack.push({ row: pick.row, col: pick.col });
    }

    cells.forEach((row) => row.forEach((cell) => { cell.visited = false; }));
    return cells;
}

function getBorderCells(size) {
    const border = [];
    for (let i = 0; i < size; i += 1) {
        border.push({ row: 0, col: i });
        border.push({ row: size - 1, col: i });
    }
    for (let i = 1; i < size - 1; i += 1) {
        border.push({ row: i, col: 0 });
        border.push({ row: i, col: size - 1 });
    }
    return border;
}

function getCenterCells(size) {
    const center = Math.floor(size / 2);
    const radius = Math.max(1, Math.floor(size / 4));
    const start = Math.max(0, center - radius);
    const end = Math.min(size - 1, center + radius);
    const centerCells = [];
    for (let row = start; row <= end; row += 1) {
        for (let col = start; col <= end; col += 1) {
            centerCells.push({ row, col });
        }
    }
    return centerCells;
}

function bfsDistances(mazeGrid, size, start) {
    const distances = Array(size * size).fill(-1);
    const queue = [];
    let head = 0;
    const startIndex = (start.row * size) + start.col;
    distances[startIndex] = 0;
    queue.push(start);

    while (head < queue.length) {
        const current = queue[head];
        head += 1;
        const currentIndex = (current.row * size) + current.col;
        const currentDist = distances[currentIndex];
        const cell = mazeGrid[current.row][current.col];
        for (const dir of Object.keys(DIRS)) {
            if (cell.walls[dir]) {
                continue;
            }
            const nextRow = current.row + DIRS[dir].dr;
            const nextCol = current.col + DIRS[dir].dc;
            const nextIndex = (nextRow * size) + nextCol;
            if (distances[nextIndex] !== -1) {
                continue;
            }
            distances[nextIndex] = currentDist + 1;
            queue.push({ row: nextRow, col: nextCol });
        }
    }

    return distances;
}

function findBestPair(mazeGrid, size, minDistance) {
    const borderCells = getBorderCells(size);
    const centerCells = getCenterCells(size);
    let bestPair = null;
    const viablePairs = [];

    borderCells.forEach((start) => {
        const distances = bfsDistances(mazeGrid, size, start);
        centerCells.forEach((target) => {
            const dist = distances[(target.row * size) + target.col];
            if (dist < 0) {
                return;
            }
            if (!bestPair || dist > bestPair.distance) {
                bestPair = { start, cheese: target, distance: dist };
            }
            if (dist >= minDistance) {
                viablePairs.push({ start, cheese: target, distance: dist });
            }
        });
    });

    if (viablePairs.length > 0) {
        return viablePairs[Math.floor(Math.random() * viablePairs.length)];
    }
    return bestPair;
}

function generateMaze(size) {
    const minDistance = Math.ceil((size * size) / 2);
    const maxAttempts = 40;
    let best = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const mazeGrid = createMaze(size);
        const pair = findBestPair(mazeGrid, size, minDistance);
        if (!pair) {
            continue;
        }
        if (!best || pair.distance > best.distance) {
            best = { ...pair, maze: mazeGrid };
        }
        if (pair.distance >= minDistance) {
            return { ...pair, maze: mazeGrid };
        }
    }

    return best;
}

function randomBetween(min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + Math.random() * (high - low);
}

function startLevel() {
    clearTimer();
    clearRotationTimers();
    resetRotationInstant();
    applyConfig();
    const generated = generateMaze(mazeSize);
    if (!generated) {
        statusLineEl.textContent = 'Failed to generate maze.';
        return;
    }
    maze = generated.maze;
    mousePos = generated.start;
    cheesePos = generated.cheese;
    shortestPathLen = generated.distance;
    buildGrid();
    isFrozen = false;
    isMoving = false;
    queuedDir = null;
    if (moveTimeout) {
        clearTimeout(moveTimeout);
        moveTimeout = null;
    }
    setMouseMood('normal');
    setMouseFacing('U');
    placeMouse();
    placeCheese();
    statusLineEl.textContent = 'Find the cheese!';
    startTimerForDistance(shortestPathLen);
    startRotationCycle();
}

if (isCustomMode) {
    [mazeSizeInput, rotationTimeMinInput, rotationIntensityMinInput, timerLeniencyInput].forEach((input) => {
        input.addEventListener('input', updateControlLabels);
    });

    if (levelPresetInput) {
        levelPresetInput.addEventListener('input', () => {
            const presetLevel = readNumber(levelPresetInput, 10);
            const preset = getPresetConfig(presetLevel);
            mazeSizeInput.value = preset.mazeSize;
            rotationTimeMinInput.value = preset.rotationTimeMin.toFixed(1);
            rotationIntensityMinInput.value = String(preset.rotationIntensityMin);
            timerLeniencyInput.value = String(Math.round(getLevelLeniency(presetLevel)));
            updateControlLabels();
        });
    }
}

document.querySelectorAll('#dpad-vertigo .vertigo-btn').forEach((button) => {
    button.addEventListener('click', onDpadClick);
});

restartButtonEl.addEventListener('click', resetGame);
document.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', () => {
    if (mousePos) {
        moveMouseToPosition(mousePos, false);
    }
});

if (closeResultsButtonEl) {
    closeResultsButtonEl.addEventListener('click', closeResults);
}
if (copyShareButtonEl) {
    copyShareButtonEl.addEventListener('click', copyShareText);
}

updateControlLabels();
startLevel();
