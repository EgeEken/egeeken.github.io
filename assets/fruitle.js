(() => {
    const GRID_SIZE = 8;
    const CELL_SIZE = 420 / GRID_SIZE;
    const FRUIT_COUNT = 8;
    const WALL_COUNT = 12;
    const MOVE_GRID_CELLS = 48;
    const LAUNCH_DAY_UTC = Date.UTC(2026, 2 /* March */, 24);
    const SNAKE_MOVE_DELAY_MS = 400;
    const parsedRatio = Number(new URLSearchParams(window.location.search).get('snakeMoves'));
    const SNAKE_MOVES_PER_TURN = Number.isInteger(parsedRatio) && parsedRatio >= 1 && parsedRatio <= 8 ? parsedRatio : 3;

    const DIRS = { U: { x: 0, y: -1 }, R: { x: 1, y: 0 }, D: { x: 0, y: 1 }, L: { x: -1, y: 0 } };
    const DIR_ORDER = ['U', 'R', 'D', 'L'];
    const ARROW = { U: '▴', R: '▸', D: '▾', L: '◂' };

    const canvas = document.getElementById('snakedle-canvas');
    const ctx = canvas.getContext('2d');
    const dailyLabelEl = document.getElementById('daily-label');
    const fruitProgressEl = document.getElementById('fruit-progress');
    const moveProgressEl = document.getElementById('move-progress');
    const statusLineEl = document.getElementById('status-line');
    const moveGridEl = document.getElementById('move-grid');
    const resultsModal = document.getElementById('results-modal');
    const resultsTextEl = document.getElementById('results-text');
    const sendButton = document.getElementById('send-move');

    let puzzle = null;
    let snake = [];
    let fruits = [];
    let selectedFruitIndex = null;
    let pendingMoveDir = null;
    let turnCount = 0;
    let gameOver = false;
    let isAnimatingTurn = false;
    let infiniteWin = false;
    let decisionMoves = [];
    let history = [];
    let initialSnapshot = null;
    let lastStateKeys = [];
    const planCache = new Map();
    const moveCells = [];

    const dayNumber = getDayNumber(new Date());
    dailyLabelEl.textContent = `Fruitle Day ${dayNumber}`;
    document.documentElement.style.setProperty('--snakedle-grid-size', String(GRID_SIZE));

    for (let i = 0; i < MOVE_GRID_CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'move-cell';
        moveGridEl.appendChild(cell);
        moveCells.push(cell);
    }

    function getDayNumber(date) {
        const parisTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const todayParis = Date.UTC(parisTime.getFullYear(), parisTime.getMonth(), parisTime.getDate());
        return Math.max(1, Math.floor((todayParis - LAUNCH_DAY_UTC) / 86400000) + 1);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function toCoord(x, y) {
        const file = String.fromCharCode(97 + x);
        const rank = GRID_SIZE - y;
        return `${file}${rank}`;
    }

    function moveNotation(fromX, fromY, toX, toY) {
        return `${toCoord(fromX, fromY)}-${toCoord(toX, toY)}`;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    const key = (x, y) => `${x},${y}`;
    const parse = (k) => { const [x, y] = k.split(',').map(Number); return { x, y }; };
    const inBounds = (x, y) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
    const cloneSnake = (src) => src.map(c => ({ x: c.x, y: c.y }));
    const cloneFruits = (src) => src.map(f => ({ x: f.x, y: f.y, alive: f.alive }));
    const aliveCount = () => fruits.reduce((n, f) => n + (f.alive ? 1 : 0), 0);
    const aliveFruits = (list = fruits) => list.filter(f => f.alive).map(f => ({ x: f.x, y: f.y }));
    const onSnake = (x, y) => snake.some(s => s.x === x && s.y === y);

    function fruitAt(x, y, ignore = -1) {
        for (let i = 0; i < fruits.length; i++) {
            if (i === ignore || !fruits[i].alive) continue;
            if (fruits[i].x === x && fruits[i].y === y) return i;
        }
        return -1;
    }

    function stateKey(s = snake, f = fruits) {
        const snakePart = s.map(c => `${c.x},${c.y}`).join(';');
        const fruitPart = f.map(v => (v.alive ? `${v.x},${v.y}` : 'x')).join(';');
        return `${snakePart}|${fruitPart}`;
    }

    function saveHistory() {
        history.push({
            snake: cloneSnake(snake),
            fruits: cloneFruits(fruits),
            selectedFruitIndex,
            pendingMoveDir,
            turnCount,
            decisionMoves: decisionMoves.slice(),
            gameOver,
            infiniteWin,
            isAnimatingTurn,
            lastStateKeys: lastStateKeys.slice()
        });
    }

    function restoreHistory(snapshot) {
        snake = cloneSnake(snapshot.snake);
        fruits = cloneFruits(snapshot.fruits);
        selectedFruitIndex = snapshot.selectedFruitIndex;
        pendingMoveDir = snapshot.pendingMoveDir;
        turnCount = snapshot.turnCount;
        decisionMoves = snapshot.decisionMoves.slice();
        gameOver = snapshot.gameOver;
        infiniteWin = snapshot.infiniteWin;
        isAnimatingTurn = snapshot.isAnimatingTurn;
        lastStateKeys = snapshot.lastStateKeys.slice();
    }

    function randomChoice(arr, rng) {
        return arr[Math.floor(rng() * arr.length)];
    }

    function shuffle(arr, rng) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    function generateDailyPuzzle(day) {
        const allCells = [];
        for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) allCells.push(key(x, y));

        for (let attempt = 0; attempt < 160; attempt++) {
            const rng = mulberry32(((day * 2654435761) + attempt * 1013904223) >>> 0);
            const head = parse(randomChoice(allCells, rng));
            const neighbors = DIR_ORDER.map(d => ({ x: head.x + DIRS[d].x, y: head.y + DIRS[d].y })).filter(c => inBounds(c.x, c.y));
            const tail = randomChoice(neighbors, rng);

            const snakeSet = new Set([key(head.x, head.y), key(tail.x, tail.y)]);
            const open = allCells.filter(c => !snakeSet.has(c));
            const fruitCells = shuffle(open, rng).slice(0, FRUIT_COUNT).map(parse);
            const fruitSet = new Set(fruitCells.map(c => key(c.x, c.y)));
            const wallCells = open.filter(c => !fruitSet.has(c));
            const walls = new Set(shuffle(wallCells, rng).slice(0, WALL_COUNT));
            return { snakeStart: [head, tail], fruitStart: fruitCells.map(f => ({ ...f, alive: true })), walls };
        }

        return {
            snakeStart: [{ x: 1, y: 1 }, { x: 0, y: 1 }],
            fruitStart: [{ x: 2, y: 2, alive: true }, { x: 4, y: 2, alive: true }, { x: 6, y: 2, alive: true }, { x: 2, y: 5, alive: true }, { x: 4, y: 5, alive: true }, { x: 6, y: 5, alive: true }, { x: 3, y: 7, alive: true }, { x: 7, y: 7, alive: true }],
            walls: new Set()
        };
    }

    function encodeBodyShapePacked(body, width) {
        const length = body.length;
        if (length <= 1) {
            return (1 << 28) >>> 0;
        }

        let packed = 0;
        for (let i = 0; i < length - 1; i++) {
            const current = body[i];
            const next = body[i + 1];
            const diff = next - current;

            let code = 0;
            if (diff === -width) code = 0;
            else if (diff === 1) code = 1;
            else if (diff === width) code = 2;
            else if (diff === -1) code = 3;

            packed |= (code << (i * 2));
        }

        return (((length & 0x0f) << 28) | packed) >>> 0;
    }

    function reconstructMoves(states, stateIndex, lastMove) {
        const reversed = [lastMove];
        let cursor = stateIndex;

        while (cursor >= 0) {
            const state = states[cursor];
            if (state.move) {
                reversed.push(state.move);
            }
            cursor = state.parent;
        }

        reversed.reverse();
        return reversed;
    }

    function advanceStatePacked(body, mask, dirIndex, nextByDir, wallBlocked, fruitAtCell) {
        const nextHead = nextByDir[dirIndex][body[0]];
        if (nextHead < 0 || wallBlocked[nextHead]) {
            return { valid: false };
        }

        const fruitAtHead = fruitAtCell[nextHead];
        const willEat = fruitAtHead >= 0 && (mask & (1 << fruitAtHead)) === 0;
        const collisionLimit = willEat ? body.length : body.length - 1;
        for (let i = 0; i < collisionLimit; i++) {
            if (body[i] === nextHead) {
                return { valid: false };
            }
        }

        if (body.length === 2 && nextHead === body[1]) {
            return { valid: false };
        }

        const copyLength = willEat ? body.length : body.length - 1;
        const nextBody = new Array(copyLength + 1);
        nextBody[0] = nextHead;
        for (let i = 0; i < copyLength; i++) {
            nextBody[i + 1] = body[i];
        }

        let nextMask = mask;
        if (willEat) {
            nextMask |= (1 << fruitAtHead);
        }

        return { valid: true, body: nextBody, mask: nextMask };
    }

    function findSnakePlan(startSnake, currentFruits, walls) {
        if (currentFruits.length === 0) return { solvable: true, moves: [] };

        const totalCells = GRID_SIZE * GRID_SIZE;
        const wallBlocked = new Uint8Array(totalCells);
        for (const wall of walls) {
            const c = parse(wall);
            wallBlocked[c.y * GRID_SIZE + c.x] = 1;
        }

        const fruitAtCell = new Int16Array(totalCells);
        fruitAtCell.fill(-1);
        currentFruits.forEach((f, i) => {
            fruitAtCell[f.y * GRID_SIZE + f.x] = i;
        });

        const targetMask = (1 << currentFruits.length) - 1;

        const nextUp = new Int16Array(totalCells);
        const nextRight = new Int16Array(totalCells);
        const nextDown = new Int16Array(totalCells);
        const nextLeft = new Int16Array(totalCells);
        nextUp.fill(-1);
        nextRight.fill(-1);
        nextDown.fill(-1);
        nextLeft.fill(-1);

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const idx = y * GRID_SIZE + x;
                if (y > 0) nextUp[idx] = idx - GRID_SIZE;
                if (x < GRID_SIZE - 1) nextRight[idx] = idx + 1;
                if (y < GRID_SIZE - 1) nextDown[idx] = idx + GRID_SIZE;
                if (x > 0) nextLeft[idx] = idx - 1;
            }
        }

        const nextByDir = [nextUp, nextRight, nextDown, nextLeft];
        const startBody = startSnake.map(c => c.y * GRID_SIZE + c.x);

        const states = [{
            body: startBody,
            mask: 0,
            parent: -1,
            move: ''
        }];
        const queue = [0];
        let queueIndex = 0;

        const visitedByHeadMask = new Map();
        const startHeadMaskKey = (startBody[0] | (0 << 8)) >>> 0;
        visitedByHeadMask.set(startHeadMaskKey, new Set([encodeBodyShapePacked(startBody, GRID_SIZE)]));

        while (queueIndex < queue.length) {
            const stateIndex = queue[queueIndex++];
            const state = states[stateIndex];

            for (let dirIndex = 0; dirIndex < 4; dirIndex++) {
                const next = advanceStatePacked(state.body, state.mask, dirIndex, nextByDir, wallBlocked, fruitAtCell);
                if (!next.valid) {
                    continue;
                }

                if (next.mask === targetMask) {
                    return {
                        solvable: true,
                        moves: reconstructMoves(states, stateIndex, DIR_ORDER[dirIndex])
                    };
                }

                const headMaskKey = (next.body[0] | (next.mask << 8)) >>> 0;
                const bodyShapeKey = encodeBodyShapePacked(next.body, GRID_SIZE);
                const seenShapes = visitedByHeadMask.get(headMaskKey);
                if (!seenShapes) {
                    visitedByHeadMask.set(headMaskKey, new Set([bodyShapeKey]));
                } else if (seenShapes.has(bodyShapeKey)) {
                    continue;
                } else {
                    seenShapes.add(bodyShapeKey);
                }

                states.push({
                    body: next.body,
                    mask: next.mask,
                    parent: stateIndex,
                    move: DIR_ORDER[dirIndex]
                });
                queue.push(states.length - 1);
            }
        }

        return { solvable: false, moves: [] };
    }

    function getPlanForCurrentState() {
        const cacheKey = stateKey();
        let plan = planCache.get(cacheKey);
        if (!plan) {
            plan = findSnakePlan(cloneSnake(snake), aliveFruits(), puzzle.walls);
            planCache.set(cacheKey, plan);
        }
        return plan;
    }

    function getSnakeMove() {
        const plan = getPlanForCurrentState();
        if (!plan.solvable || plan.moves.length === 0) return null;
        return plan.moves[0];
    }

    function moveSnake(dir) {
        const nx = snake[0].x + DIRS[dir].x;
        const ny = snake[0].y + DIRS[dir].y;
        if (!inBounds(nx, ny) || puzzle.walls.has(key(nx, ny))) return false;
        const eatIdx = fruitAt(nx, ny);
        const collisionBody = eatIdx >= 0 ? snake : snake.slice(0, -1);
        if (collisionBody.some(c => c.x === nx && c.y === ny)) return false;
        if (snake.length === 2 && nx === snake[1].x && ny === snake[1].y) return false;
        snake.unshift({ x: nx, y: ny });
        if (eatIdx >= 0) fruits[eatIdx].alive = false;
        else snake.pop();
        if (selectedFruitIndex != null && (!fruits[selectedFruitIndex] || !fruits[selectedFruitIndex].alive)) selectedFruitIndex = null;
        return true;
    }

    function getFruitMovePreview(dir = pendingMoveDir) {
        if (!dir) return null;
        if (selectedFruitIndex == null || !fruits[selectedFruitIndex] || !fruits[selectedFruitIndex].alive) {
            return { valid: false, reason: 'Select a fruit first.' };
        }
        const fruit = fruits[selectedFruitIndex];
        const nx = fruit.x + DIRS[dir].x;
        const ny = fruit.y + DIRS[dir].y;
        if (!inBounds(nx, ny)) return { valid: false, reason: 'Out of bounds.' };
        if (puzzle.walls.has(key(nx, ny))) return { valid: false, reason: 'Blocked by a wall.' };
        if (onSnake(nx, ny)) return { valid: false, reason: 'Snake occupies that cell.' };
        if (fruitAt(nx, ny, selectedFruitIndex) >= 0) return { valid: false, reason: 'Another fruit is there.' };
        return {
            valid: true,
            fromX: fruit.x,
            fromY: fruit.y,
            toX: nx,
            toY: ny,
            dir,
            notation: moveNotation(fruit.x, fruit.y, nx, ny)
        };
    }

    function applyFruitPreviewMove(preview) {
        if (!preview || !preview.valid || selectedFruitIndex == null || !fruits[selectedFruitIndex]) return false;
        fruits[selectedFruitIndex].x = preview.toX;
        fruits[selectedFruitIndex].y = preview.toY;
        return true;
    }

    function performanceEmoji(turns, isInfiniteCase) {
        if (isInfiniteCase) return '🟪';
        if (turns < 5) return '🟥';
        if (turns < 10) return '🟧';
        if (turns < 15) return '🟨';
        if (turns < 20) return '🟩';
        return '🟦';
    }

    function updateButtons() {
        const lockControls = isAnimatingTurn || gameOver;
        document.querySelectorAll('[data-dir]').forEach(btn => {
            btn.classList.toggle('pending', btn.dataset.dir === pendingMoveDir);
            btn.disabled = lockControls;
        });
        sendButton.disabled = lockControls;
        document.getElementById('undo-move').disabled = isAnimatingTurn;
        document.getElementById('clear-moves').disabled = isAnimatingTurn;
    }

    function roundRect(context, x, y, w, h, r) {
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + w - r, y);
        context.quadraticCurveTo(x + w, y, x + w, y + r);
        context.lineTo(x + w, y + h - r);
        context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        context.lineTo(x + r, y + h);
        context.quadraticCurveTo(x, y + h, x, y + h - r);
        context.lineTo(x, y + r);
        context.quadraticCurveTo(x, y, x + r, y);
        context.closePath();
    }

    function drawPreview() {
        const preview = getFruitMovePreview();
        if (!preview || !preview.valid) return;

        const fromCx = preview.fromX * CELL_SIZE + CELL_SIZE / 2;
        const fromCy = preview.fromY * CELL_SIZE + CELL_SIZE / 2;
        const toCx = preview.toX * CELL_SIZE + CELL_SIZE / 2;
        const toCy = preview.toY * CELL_SIZE + CELL_SIZE / 2;

        ctx.strokeStyle = 'rgba(255, 195, 70, 0.75)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fromCx, fromCy);
        ctx.lineTo(toCx, toCy);
        ctx.stroke();

        const angle = Math.atan2(toCy - fromCy, toCx - fromCx);
        const arrowLen = CELL_SIZE * 0.16;
        ctx.fillStyle = 'rgba(255, 195, 70, 0.8)';
        ctx.beginPath();
        ctx.moveTo(toCx, toCy);
        ctx.lineTo(toCx - arrowLen * Math.cos(angle - Math.PI / 6), toCy - arrowLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toCx - arrowLen * Math.cos(angle + Math.PI / 6), toCy - arrowLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        const r = CELL_SIZE * 0.22;
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = '#e05555';
        ctx.beginPath();
        ctx.arc(toCx, toCy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff9999';
        ctx.beginPath();
        ctx.arc(toCx - r * 0.35, toCy - r * 0.35, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function draw() {
        ctx.fillStyle = '#0c2030';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(125, 223, 223, 0.18)';
        for (let c = 0; c <= GRID_SIZE; c++) {
            ctx.beginPath(); ctx.moveTo(c * CELL_SIZE, 0); ctx.lineTo(c * CELL_SIZE, canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, c * CELL_SIZE); ctx.lineTo(canvas.width, c * CELL_SIZE); ctx.stroke();
        }

        for (const w of puzzle.walls) {
            const c = parse(w);
            ctx.fillStyle = '#24384a';
            ctx.fillRect(c.x * CELL_SIZE + 6, c.y * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12);
        }

        fruits.forEach((fruit, i) => {
            if (!fruit.alive) return;
            const x = fruit.x * CELL_SIZE + CELL_SIZE / 2;
            const y = fruit.y * CELL_SIZE + CELL_SIZE / 2;
            const r = CELL_SIZE * 0.22;
            const selected = i === selectedFruitIndex;
            ctx.fillStyle = selected ? '#c93a3a' : '#e05555';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = selected ? '#f5b1b1' : '#ff9999';
            ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
        });

        drawPreview();

        for (let i = snake.length - 1; i >= 0; i--) {
            const s = snake[i];
            const x = s.x * CELL_SIZE;
            const y = s.y * CELL_SIZE;
            const pad = 6;
            const size = CELL_SIZE - pad * 2;
            ctx.fillStyle = i === 0 ? '#7ddfdf' : '#126364';
            ctx.strokeStyle = '#0a4a4a';
            ctx.lineWidth = 2;
            roundRect(ctx, x + pad, y + pad, size, size, 12);
            ctx.fill();
            ctx.stroke();
        }

        if (snake.length > 0) {
            const head = snake[0];
            const neck = snake[1];
            let dx = 1;
            let dy = 0;
            if (neck) {
                dx = head.x - neck.x;
                dy = head.y - neck.y;
            }

            const headX = head.x * CELL_SIZE;
            const headY = head.y * CELL_SIZE;
            const eyeR = CELL_SIZE * 0.11;

            let eye1 = [headX + CELL_SIZE * 0.28, headY + CELL_SIZE * 0.3];
            let eye2 = [headX + CELL_SIZE * 0.72, headY + CELL_SIZE * 0.3];
            if (dx > 0) {
                eye1 = [headX + CELL_SIZE * 0.68, headY + CELL_SIZE * 0.3];
                eye2 = [headX + CELL_SIZE * 0.68, headY + CELL_SIZE * 0.7];
            } else if (dx < 0) {
                eye1 = [headX + CELL_SIZE * 0.32, headY + CELL_SIZE * 0.3];
                eye2 = [headX + CELL_SIZE * 0.32, headY + CELL_SIZE * 0.7];
            } else if (dy > 0) {
                eye1 = [headX + CELL_SIZE * 0.3, headY + CELL_SIZE * 0.68];
                eye2 = [headX + CELL_SIZE * 0.7, headY + CELL_SIZE * 0.68];
            }

            ctx.fillStyle = '#8b0d0d';
            ctx.beginPath();
            ctx.arc(eye1[0], eye1[1], eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eye2[0], eye2[1], eyeR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function refreshMoveGrid() {
        const recent = decisionMoves.slice(-MOVE_GRID_CELLS);
        const offset = MOVE_GRID_CELLS - recent.length;
        for (let i = 0; i < MOVE_GRID_CELLS; i++) {
            const cell = moveCells[i];
            const move = i >= offset ? recent[i - offset] : null;
            if (move) {
                cell.textContent = move;
                cell.classList.add('filled');
            } else {
                cell.textContent = '';
                cell.classList.remove('filled');
            }
        }
    }

    function refresh() {
        fruitProgressEl.textContent = `Remaining Fruits: ${aliveCount()}/${FRUIT_COUNT}`;
        moveProgressEl.textContent = `Survived Turns: ${turnCount}`;
        updateButtons();
        refreshMoveGrid();
        draw();
    }

    function detectRepeatedTwoStateLoop() {
        const now = stateKey();
        lastStateKeys.push(now);
        if (lastStateKeys.length > 4) lastStateKeys.shift();
        if (lastStateKeys.length < 4) return false;
        const a = lastStateKeys[0];
        const b = lastStateKeys[1];
        const c = lastStateKeys[2];
        const d = lastStateKeys[3];
        return a === c && b === d && a !== b;
    }

    function setPendingStatus() {
        if (!pendingMoveDir) {
            statusLineEl.textContent = selectedFruitIndex == null ? 'Click a fruit, choose a direction, then press ✓ to send your turn.' : 'Fruit selected. Choose direction then press ✓.';
            return;
        }

        const preview = getFruitMovePreview();
        if (selectedFruitIndex == null) {
            statusLineEl.textContent = `Direction ${ARROW[pendingMoveDir]} selected. Click a fruit.`;
            return;
        }

        if (!preview || !preview.valid) {
            statusLineEl.textContent = `Invalid preview: ${preview ? preview.reason : 'Select a fruit first.'}`;
            return;
        }

        statusLineEl.textContent = `Preview ${preview.notation}. Press ✓ to send turn.`;
    }

    async function sendTurn() {
        if (gameOver || isAnimatingTurn) return;
        const preview = getFruitMovePreview();
        if (!preview || !preview.valid) {
            statusLineEl.textContent = preview ? `That fruit move is invalid: ${preview.reason}` : 'Choose a direction first.';
            return;
        }

        saveHistory();
        if (!applyFruitPreviewMove(preview)) {
            history.pop();
            statusLineEl.textContent = 'That fruit move is invalid.';
            return;
        }

        const t0 = performance.now();
        decisionMoves.push(preview.notation);
        turnCount += 1;
        pendingMoveDir = null;

        const planAfterMove = getPlanForCurrentState();
        if (!planAfterMove.solvable && aliveCount() > 0) {
            infiniteWin = true;
            gameOver = true;
            const ms = Math.round(performance.now() - t0);
            statusLineEl.textContent = `No complete snake route exists from this state. Infinite run achieved in ${turnCount} turns (${ms}ms).`;
            refresh();
            return;
        }

        isAnimatingTurn = true;
        refresh();

        let snakeMovesDone = 0;
        let solvedNormally = false;
        let infiniteByLoop = false;
        let infiniteByUnsolvable = false;

        for (let i = 0; i < SNAKE_MOVES_PER_TURN; i++) {
            if (aliveCount() === 0) {
                solvedNormally = true;
                break;
            }
            const next = getSnakeMove();
            if (!next || !moveSnake(next)) {
                infiniteByUnsolvable = true;
                break;
            }
            snakeMovesDone += 1;
            refresh();
            await sleep(SNAKE_MOVE_DELAY_MS);

            if (detectRepeatedTwoStateLoop()) {
                infiniteByLoop = true;
                break;
            }

            const plan = getPlanForCurrentState();
            if (!plan.solvable && aliveCount() > 0) {
                infiniteByUnsolvable = true;
                break;
            }
        }

        isAnimatingTurn = false;

        const ms = Math.round(performance.now() - t0);
        if (solvedNormally || aliveCount() === 0) {
            gameOver = true;
            infiniteWin = false;
            statusLineEl.textContent = `Snake cleared all fruits in ${turnCount} turns. Decision time ${ms}ms.`;
        } else if (infiniteByLoop || infiniteByUnsolvable) {
            gameOver = true;
            infiniteWin = true;
            statusLineEl.textContent = infiniteByLoop
                ? `Detected repeated snake-state loop. Infinite run achieved in ${turnCount} turns.`
                : `Snake cannot finish from this map state. Infinite run achieved in ${turnCount} turns.`;
        } else {
            statusLineEl.textContent = `Turn ${turnCount}: snake moved ${snakeMovesDone}/${SNAKE_MOVES_PER_TURN}. Decision time ${ms}ms.`;
        }
        refresh();
    }

    function undoTurn() {
        if (isAnimatingTurn || history.length === 0) return;
        restoreHistory(history.pop());
        statusLineEl.textContent = 'Undid last player decision and snake response.';
        refresh();
    }

    function clearMovesAndReset() {
        if (isAnimatingTurn || !initialSnapshot) return;
        restoreHistory(initialSnapshot);
        history = [];
        statusLineEl.textContent = 'Move queue cleared and map reset to start.';
        refresh();
    }

    function shareRun() {
        const remaining = aliveCount();
        const emoji = performanceEmoji(turnCount, infiniteWin);
        const share = infiniteWin
            ? `Fruitle Day ${dayNumber} Remaining Fruits: ${remaining}/${FRUIT_COUNT} Survived Turns: Infinite ${emoji}\nhttps://egeeken.github.io/fruitle`
            : `Fruitle Day ${dayNumber} Survived Turns: ${turnCount} ${emoji}\nhttps://egeeken.github.io/fruitle`;
        resultsTextEl.textContent = share;
        resultsModal.style.display = 'flex';
        localStorage.setItem(`fruitle-${dayNumber}`, JSON.stringify({ remaining, turns: turnCount, infinite: infiniteWin, snakeMovesPerTurn: SNAKE_MOVES_PER_TURN, emoji, at: new Date().toISOString() }));
    }

    document.querySelectorAll('[data-dir]').forEach(btn => btn.addEventListener('click', () => {
        if (isAnimatingTurn || gameOver) return;
        pendingMoveDir = btn.dataset.dir;
        setPendingStatus();
        refresh();
    }));
    document.getElementById('undo-move').addEventListener('click', undoTurn);
    document.getElementById('clear-moves').addEventListener('click', clearMovesAndReset);
    document.getElementById('submit-snakedle').addEventListener('click', shareRun);
    sendButton.addEventListener('click', () => { void sendTurn(); });

    canvas.addEventListener('click', (event) => {
        if (!puzzle || gameOver || isAnimatingTurn) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(((event.clientX - rect.left) * (canvas.width / rect.width)) / CELL_SIZE);
        const y = Math.floor(((event.clientY - rect.top) * (canvas.height / rect.height)) / CELL_SIZE);
        const idx = fruitAt(x, y);
        if (idx >= 0) {
            selectedFruitIndex = idx;
            setPendingStatus();
            refresh();
        }
    });

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        const arrowMap = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' };
        const wasdMap = { w: 'U', a: 'L', s: 'D', d: 'R' };
        const mapped = arrowMap[e.key] || wasdMap[e.key.toLowerCase()];
        if (mapped) {
            e.preventDefault();
            if (isAnimatingTurn || gameOver) return;
            pendingMoveDir = mapped;
            setPendingStatus();
            refresh();
            return;
        }
        if (e.key === 'Enter') { e.preventDefault(); void sendTurn(); return; }
        if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoTurn(); return; }
        if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { e.preventDefault(); clearMovesAndReset(); return; }
    });

    document.getElementById('copy-share').addEventListener('click', async () => {
        const text = resultsTextEl.textContent;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const temp = document.createElement('textarea');
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        statusLineEl.textContent = 'Share text copied.';
    });

    document.getElementById('close-results').addEventListener('click', () => { resultsModal.style.display = 'none'; });
    resultsModal.addEventListener('click', (e) => { if (e.target === resultsModal) resultsModal.style.display = 'none'; });

    const startMs = performance.now();
    puzzle = generateDailyPuzzle(dayNumber);
    snake = cloneSnake(puzzle.snakeStart);
    fruits = cloneFruits(puzzle.fruitStart);
    initialSnapshot = {
        snake: cloneSnake(snake),
        fruits: cloneFruits(fruits),
        selectedFruitIndex: null,
        pendingMoveDir: null,
        turnCount: 0,
        decisionMoves: [],
        gameOver: false,
        infiniteWin: false,
        isAnimatingTurn: false,
        lastStateKeys: []
    };
    lastStateKeys = [];
    const initialPlan = getPlanForCurrentState();
    if (!initialPlan.solvable && aliveCount() > 0) {
        gameOver = true;
        infiniteWin = true;
        statusLineEl.textContent = `Daily map loaded in ${Math.round(performance.now() - startMs)}ms. No complete snake route exists, so this is an infinite-run win.`;
    } else {
        statusLineEl.textContent = `Daily map loaded in ${Math.round(performance.now() - startMs)}ms. Snake moves ${SNAKE_MOVES_PER_TURN} per turn.`;
    }
    refresh();
})();
