const MODE = document.body.dataset.mode || 'standard';
const isCustomMode = MODE === 'custom';
const isHardMode = MODE === 'hard';

const gridEl = document.getElementById('tiles-grid');
const statusLineEl = document.getElementById('status-line');
const strikeDisplayEl = document.getElementById('strike-display');
const restartButtonEl = document.getElementById('restart-button');
const levelLabelEl = document.getElementById('level-label');
const startLevelToggleEl = document.getElementById('start-level-10-toggle');

const resultsModal = document.getElementById('results-modal');
const resultsTextEl = document.getElementById('results-text');
const copyShareButtonEl = document.getElementById('copy-share');
const closeResultsButtonEl = document.getElementById('close-results');

const levelPresetInput = document.getElementById('preset-level');
const levelPresetValueEl = document.getElementById('preset-level-value');
const gridSizeInput = document.getElementById('grid-size');
const highlightRateInput = document.getElementById('highlight-rate');
const revealTimeInput = document.getElementById('reveal-time');
const strikeLimitInput = document.getElementById('strike-limit');

const gridSizeValueEl = document.getElementById('grid-size-value');
const highlightRateValueEl = document.getElementById('highlight-rate-value');
const revealTimeValueEl = document.getElementById('reveal-time-value');
const strikeLimitValueEl = document.getElementById('strike-limit-value');

const RESTART_REVEAL_DELAY_MS = 200;

const DEFAULT_START_LEVEL = 1;
const ALT_START_LEVEL = 10;
const ALT_HARD_START_LEVEL = 5;

let level = DEFAULT_START_LEVEL;
let startLevel = DEFAULT_START_LEVEL;
let gridSize = 3;
let highlightCount = 3;
let revealTimeMs = 1000;
let strikeLimit = 3;
let strikeCount = 0;

let highlightedTiles = new Set();
let foundTiles = new Set();
let isLocked = true;
let isGameOver = false;
let revealTimeout = null;
let hideTimeout = null;

function getStandardConfig(targetLevel) {
    let size = 3;
    let count = 3;

    for (let i = 1; i < targetLevel; i += 1) {
        count += 1;
        const totalTiles = size * size;
        if (count >= totalTiles * 0.5) {
            size += 1;
        }
    }

    return {
        gridSize: size,
        highlightCount: count,
        revealTimeMs: 1000,
        strikeLimit: 3
    };
}

function getHardConfig(targetLevel) {
    const base = getStandardConfig(targetLevel);
    return {
        ...base,
        revealTimeMs: 100,
        strikeLimit: 1
    };
}

function getStartLevel() {
    if (isHardMode) {
        return startLevelToggleEl && startLevelToggleEl.checked ? ALT_HARD_START_LEVEL : DEFAULT_START_LEVEL;
    } else {
        return startLevelToggleEl && startLevelToggleEl.checked ? ALT_START_LEVEL : DEFAULT_START_LEVEL;
    }
}

function applyStartLevel() {
    startLevel = getStartLevel();
    if (!isCustomMode) {
        level = startLevel;
    }
}

function getCustomConfig() {
    const size = Number(gridSizeInput.value);
    const range = syncHighlightRange(size);
    const count = range.value;

    return {
        gridSize: size,
        highlightCount: count,
        revealTimeMs: Number(revealTimeInput.value),
        strikeLimit: Number(strikeLimitInput.value)
    };
}

function levelToConfig(lvl) {
    const clamped = Math.max(1, Math.min(32, lvl));
    return getStandardConfig(clamped);
}

function getHighlightRange(size) {
    const totalTiles = size * size;
    const min = Math.max(1, Math.ceil(totalTiles * 0.3));
    const max = Math.max(min, Math.floor(totalTiles * 0.5));
    return { min, max, totalTiles };
}

function syncHighlightRange(size) {
    const range = getHighlightRange(size);

    if (!highlightRateInput) {
        return { ...range, value: range.min };
    }

    highlightRateInput.min = String(range.min);
    highlightRateInput.max = String(range.max);
    highlightRateInput.step = '1';

    let value = Number(highlightRateInput.value);
    if (Number.isNaN(value)) {
        value = range.min;
    }
    value = Math.min(range.max, Math.max(range.min, value));
    highlightRateInput.value = String(value);

    return { ...range, value };
}

function updateControlLabels() {
    if (!isCustomMode) {
        return;
    }

    const size = Number(gridSizeInput.value);
    const range = syncHighlightRange(size);
    const count = range.value;
    const percent = Math.round((count / range.totalTiles) * 100);

    gridSizeValueEl.textContent = `${size} × ${size}`;
    highlightRateValueEl.textContent = `${count} tiles (${percent}%)`;
    revealTimeValueEl.textContent = `${Number(revealTimeInput.value)} ms`;
    strikeLimitValueEl.textContent = `${Number(strikeLimitInput.value)}`;

    if (levelPresetInput) {
        levelPresetValueEl.textContent = levelPresetInput.value;
    }
}

function applyConfig() {
    const config = isCustomMode ? getCustomConfig() : (isHardMode ? getHardConfig(level) : getStandardConfig(level));
    gridSize = config.gridSize;
    highlightCount = config.highlightCount;
    revealTimeMs = config.revealTimeMs;
    strikeLimit = config.strikeLimit;

    if (levelLabelEl) {
        levelLabelEl.textContent = `Level ${level}`;
    }
}

function resetState() {
    highlightedTiles = new Set();
    foundTiles = new Set();
    strikeCount = 0;
    isGameOver = false;
    isLocked = true;
    updateStrikeDisplay();
}

function updateStrikeDisplay() {
    if (strikeDisplayEl) {
        strikeDisplayEl.textContent = `Strikes: ${strikeCount} / ${strikeLimit}`;
    }
}

function clearTimers() {
    if (revealTimeout) {
        clearTimeout(revealTimeout);
        revealTimeout = null;
    }
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function buildGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${gridSize}, minmax(0, 1fr))`;

    const totalTiles = gridSize * gridSize;
    for (let i = 0; i < totalTiles; i += 1) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile disabled';
        tile.dataset.index = String(i);
        tile.addEventListener('click', onTileClick);
        gridEl.appendChild(tile);
    }
}

function chooseHighlightedTiles() {
    const totalTiles = gridSize * gridSize;
    const chosen = new Set();
    while (chosen.size < highlightCount) {
        const index = Math.floor(Math.random() * totalTiles);
        chosen.add(index);
    }
    highlightedTiles = chosen;
}

function setGridDisabled(disabled) {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        tile.classList.toggle('disabled', disabled);
    });
}

function revealTiles() {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        const index = Number(tile.dataset.index);
        if (highlightedTiles.has(index)) {
            tile.classList.add('revealed');
        }
    });
}

function hideTiles() {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        tile.classList.remove('revealed');
    });
}

function startRound() {
    clearTimers();
    applyConfig();
    resetState();
    buildGrid();
    chooseHighlightedTiles();

    statusLineEl.textContent = 'Memorize the tiles...';
    setGridDisabled(true);

    revealTimeout = setTimeout(() => {
        revealTiles();
        hideTimeout = setTimeout(() => {
            hideTiles();
            isLocked = false;
            setGridDisabled(false);
            statusLineEl.textContent = 'Find the tiles!';
        }, revealTimeMs);
    }, RESTART_REVEAL_DELAY_MS);
}

function onTileClick(event) {
    if (isLocked || isGameOver) {
        return;
    }

    const tile = event.currentTarget;
    const index = Number(tile.dataset.index);

    if (tile.classList.contains('correct') || tile.classList.contains('wrong')) {
        return;
    }

    if (highlightedTiles.has(index)) {
        tile.classList.add('correct');
        foundTiles.add(index);
        if (foundTiles.size === highlightCount) {
            handleWin();
        }
    } else {
        tile.classList.add('wrong');
        strikeCount += 1;
        updateStrikeDisplay();
        if (strikeCount >= strikeLimit) {
            handleLoss();
        }
    }
}

function handleWin() {
    isLocked = true;
    setGridDisabled(true);
    statusLineEl.textContent = 'Nice!';

    // flash correct tiles green for 500ms
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        const index = Number(tile.dataset.index);
        if (highlightedTiles.has(index)) {
            tile.classList.add('win');
            tile.classList.remove('wrong');
        }
    });

    setTimeout(() => {
        gridEl.querySelectorAll('.tile').forEach((tile) => {
            tile.classList.remove('win');
        });

        if (!isCustomMode) {
            level += 1;
        }
        statusLineEl.textContent = 'Loading next round...';
        startRound();
    }, 500);
}

function revealAll(mode = 'correct') {
    gridEl.querySelectorAll('.tile').forEach((tile) => {
        const index = Number(tile.dataset.index);
        if (highlightedTiles.has(index)) {
            if (mode === 'lose') {
                // on loss: show correct tiles the player found in green, missed ones in red
                if (foundTiles.has(index)) {
                    tile.classList.add('win');
                } else {
                    tile.classList.add('lose');
                }
            } else {
                tile.classList.add('correct');
            }
        }
    });
}

function showResults() {
    // Only show results modal on standard mode
    if (isCustomMode) {
        statusLineEl.textContent = 'Game over. Press restart to try again.';
        return;
    }

    //const shareUrl = window.location.href.split('#')[0];
    const shareUrl = isHardMode
        ? 'https://egeeken.github.io/games/brain-games/memory-tiles/memory-tiles-hard.html'
        : 'https://egeeken.github.io/memory-tiles';
    const modeLabel = 'Memory Tiles';
    const scoreLabel = `Score: ${level - 1}`;
    const shareText = `${modeLabel} - ${scoreLabel}\n${shareUrl}`;

    resultsTextEl.textContent = shareText;
    resultsModal.style.display = 'flex';
}

function handleLoss() {
    isGameOver = true;
    isLocked = true;
    setGridDisabled(true);
    revealAll('lose');
    statusLineEl.textContent = 'Game over. Press restart to try again.';
    showResults();
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
    applyStartLevel();
    closeResults();
    startRound();
}

if (isCustomMode) {
    [gridSizeInput, highlightRateInput, revealTimeInput, strikeLimitInput].forEach((input) => {
        input.addEventListener('input', updateControlLabels);
    });

    if (levelPresetInput) {
        levelPresetInput.addEventListener('input', () => {
            const lvl = Number(levelPresetInput.value);
            const preset = levelToConfig(lvl);
            gridSizeInput.value = preset.gridSize;
            syncHighlightRange(preset.gridSize);
            highlightRateInput.value = String(preset.highlightCount);
            levelPresetValueEl.textContent = lvl;
            updateControlLabels();
        });
    }
}

restartButtonEl.addEventListener('click', resetGame);
if (startLevelToggleEl) {
    startLevelToggleEl.addEventListener('change', resetGame);
}
if (closeResultsButtonEl) {
    closeResultsButtonEl.addEventListener('click', closeResults);
}
if (copyShareButtonEl) {
    copyShareButtonEl.addEventListener('click', copyShareText);
}

updateControlLabels();
applyStartLevel();
startRound();
