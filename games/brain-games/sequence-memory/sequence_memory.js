const MODE = document.body.dataset.mode || 'standard';
const isCustomMode = MODE === 'custom';
const isHardMode = MODE === 'hard';

const gridEl = document.getElementById('tiles-grid');
const statusLineEl = document.getElementById('status-line');
const restartButtonEl = document.getElementById('restart-button');
const levelLabelEl = document.getElementById('level-label');
const sequenceLabelEl = document.getElementById('sequence-label');

const resultsModal = document.getElementById('results-modal');
const resultsTextEl = document.getElementById('results-text');
const copyShareButtonEl = document.getElementById('copy-share');
const closeResultsButtonEl = document.getElementById('close-results');

const startLevelInput = document.getElementById('start-level');
const tilesPerLevelInput = document.getElementById('tiles-per-level');
const gridHeightInput = document.getElementById('grid-height');
const gridWidthInput = document.getElementById('grid-width');

const startLevelValueEl = document.getElementById('start-level-value');
const tilesPerLevelValueEl = document.getElementById('tiles-per-level-value');
const gridHeightValueEl = document.getElementById('grid-height-value');
const gridWidthValueEl = document.getElementById('grid-width-value');

const RESTART_DELAY_MS = 250;
const PLAYBACK_FLASH_MS = 380;
const PLAYBACK_GAP_MS = 180;
const INPUT_FLASH_MS = 180;
const BETWEEN_LEVELS_DELAY_MS = 650;

let gridWidth = 3;
let gridHeight = 3;
let tilesPerLevel = 1;
let startLevel = 1;

let level = 1;
let sequence = [];
let inputIndex = 0;

let isLocked = true;
let isGameOver = false;
let playbackTimers = [];

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(num)));
}

function totalTiles() {
    return gridWidth * gridHeight;
}

function clearPlaybackTimers() {
    playbackTimers.forEach((timer) => clearTimeout(timer));
    playbackTimers = [];
}

function setGridDisabled(disabled) {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        tile.classList.toggle('disabled', disabled);
    });
}

function getTileElByIndex(index) {
    return gridEl.querySelector(`.tile[data-index="${index}"]`);
}

function clearTileStates() {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        tile.classList.remove('revealed', 'win', 'lose');
    });
}

function updateLabels() {
    if (levelLabelEl) {
        levelLabelEl.textContent = `Level ${level}`;
    }
    if (sequenceLabelEl) {
        sequenceLabelEl.textContent = `Sequence: ${sequence.length}`;
    }
}

function updateControlLabels() {
    if (!isCustomMode) {
        return;
    }

    startLevelValueEl.textContent = startLevelInput.value;
    tilesPerLevelValueEl.textContent = tilesPerLevelInput.value;
    gridHeightValueEl.textContent = gridHeightInput.value;
    gridWidthValueEl.textContent = gridWidthInput.value;
}

function applyConfig() {
    if (isHardMode) {
        gridWidth = 4;
        gridHeight = 4;
        tilesPerLevel = 1;
        startLevel = 1;
        return;
    }

    if (!isCustomMode) {
        gridWidth = 3;
        gridHeight = 3;
        tilesPerLevel = 1;
        startLevel = 1;
        return;
    }

    startLevel = clampInt(startLevelInput.value, 1, 30, 1);
    tilesPerLevel = clampInt(tilesPerLevelInput.value, 1, 5, 1);
    gridHeight = clampInt(gridHeightInput.value, 1, 5, 3);
    gridWidth = clampInt(gridWidthInput.value, 2, 8, 3);
}

function buildGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(0, 1fr))`;

    const tileCount = totalTiles();
    for (let i = 0; i < tileCount; i += 1) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile disabled';
        tile.dataset.index = String(i);
        tile.addEventListener('click', onTileClick);
        gridEl.appendChild(tile);
    }
}

function randomTileIndex() {
    return Math.floor(Math.random() * totalTiles());
}

function extendSequence(count) {
    for (let i = 0; i < count; i += 1) {
        sequence.push(randomTileIndex());
    }
}

function initSequenceForStartLevel() {
    sequence = [];
    extendSequence(startLevel * tilesPerLevel);
}

function showPlaybackStep(stepIndex) {
    const tileIndex = sequence[stepIndex];
    const tileEl = getTileElByIndex(tileIndex);
    if (!tileEl) {
        return;
    }

    tileEl.classList.add('revealed');
    playbackTimers.push(setTimeout(() => {
        tileEl.classList.remove('revealed');
    }, PLAYBACK_FLASH_MS));
}

function startPlayback() {
    clearPlaybackTimers();
    clearTileStates();
    isLocked = true;
    inputIndex = 0;
    setGridDisabled(true);
    updateLabels();

    statusLineEl.textContent = 'Watch the sequence...';

    for (let i = 0; i < sequence.length; i += 1) {
        const delay = i * (PLAYBACK_FLASH_MS + PLAYBACK_GAP_MS);
        playbackTimers.push(setTimeout(() => showPlaybackStep(i), delay));
    }

    const totalDelay = sequence.length * (PLAYBACK_FLASH_MS + PLAYBACK_GAP_MS);
    playbackTimers.push(setTimeout(() => {
        isLocked = false;
        setGridDisabled(false);
        statusLineEl.textContent = `Your turn: 0 / ${sequence.length}`;
    }, totalDelay));
}

function handleWin() {
    isLocked = true;
    setGridDisabled(true);
    statusLineEl.textContent = 'Nice!';

    playbackTimers.push(setTimeout(() => {
        level += 1;
        extendSequence(tilesPerLevel);
        statusLineEl.textContent = 'Next sequence...';
        startPlayback();
    }, BETWEEN_LEVELS_DELAY_MS));
}

function showResults() {
    if (!resultsModal || !resultsTextEl) {
        return;
    }

    const scoreLabel = `Score: ${level - 1}`;
    const modeLabel = isHardMode ? 'Sequence Memory (Hard Mode)' : (isCustomMode ? 'Sequence Memory (Custom)' : 'Sequence Memory');
    const shareUrl = (!isHardMode && !isCustomMode)
        ? 'https://egeeken.github.io/sequence-memory'
        : window.location.href.split('#')[0];
    const shareText = `${modeLabel} - ${scoreLabel}\n${shareUrl}`;

    resultsTextEl.textContent = shareText;
    resultsModal.style.display = 'flex';
}

function handleLoss(pressedIndex, expectedIndex) {
    isGameOver = true;
    isLocked = true;
    setGridDisabled(true);

    const pressedEl = getTileElByIndex(pressedIndex);
    const expectedEl = getTileElByIndex(expectedIndex);
    if (pressedEl) {
        pressedEl.classList.add('lose');
    }
    if (expectedEl) {
        expectedEl.classList.add('win');
    }

    statusLineEl.textContent = 'Game over. Press restart to try again.';
    showResults();
}

function flashCorrect(index) {
    const tileEl = getTileElByIndex(index);
    if (!tileEl) {
        return;
    }
    tileEl.classList.add('win');
    setTimeout(() => {
        if (isGameOver) {
            return;
        }
        tileEl.classList.remove('win');
    }, INPUT_FLASH_MS);
}

function onTileClick(event) {
    if (isLocked || isGameOver) {
        return;
    }

    const tile = event.currentTarget;
    const pressedIndex = Number(tile.dataset.index);
    const expectedIndex = sequence[inputIndex];

    if (pressedIndex === expectedIndex) {
        flashCorrect(pressedIndex);
        inputIndex += 1;
        statusLineEl.textContent = `Your turn: ${inputIndex} / ${sequence.length}`;
        if (inputIndex >= sequence.length) {
            handleWin();
        }
        return;
    }

    handleLoss(pressedIndex, expectedIndex);
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

function resetGame() {
    clearPlaybackTimers();
    closeResults();
    isGameOver = false;
    isLocked = true;

    applyConfig();
    level = startLevel;
    buildGrid();
    initSequenceForStartLevel();
    updateLabels();

    statusLineEl.textContent = 'Get ready...';
    playbackTimers.push(setTimeout(startPlayback, RESTART_DELAY_MS));
}

if (isCustomMode) {
    [startLevelInput, tilesPerLevelInput, gridHeightInput, gridWidthInput].forEach((input) => {
        input.addEventListener('input', updateControlLabels);
    });
    updateControlLabels();
}

restartButtonEl.addEventListener('click', resetGame);
if (closeResultsButtonEl) {
    closeResultsButtonEl.addEventListener('click', closeResults);
}
if (copyShareButtonEl) {
    copyShareButtonEl.addEventListener('click', copyShareText);
}

resetGame();
