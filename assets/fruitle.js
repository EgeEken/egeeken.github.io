(() => {
    const GRID_SIZE = 8;
    const CELL_SIZE = 420 / GRID_SIZE;
    const FRUIT_COUNT = 8;
    const WALL_COUNT = 12;
    const MOVE_GRID_CELLS = 48;
    const LAUNCH_DAY_UTC = Date.UTC(2026, 2, 24);
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
    let decisionMoves = [];
    let history = [];
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
            gameOver
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
            if (findSnakePlan([head, tail], fruitCells, walls).length > 0) {
                return { snakeStart: [head, tail], fruitStart: fruitCells.map(f => ({ ...f, alive: true })), walls };
            }
        }

        return {
            snakeStart: [{ x: 1, y: 1 }, { x: 0, y: 1 }],
            fruitStart: [{ x: 2, y: 2, alive: true }, { x: 4, y: 2, alive: true }, { x: 6, y: 2, alive: true }, { x: 2, y: 5, alive: true }, { x: 4, y: 5, alive: true }, { x: 6, y: 5, alive: true }, { x: 3, y: 7, alive: true }, { x: 7, y: 7, alive: true }],
            walls: new Set()
        };
    }

    function findSnakePlan(startSnake, currentFruits, walls) {
        if (currentFruits.length === 0) return [];

        const wallBlock = new Uint8Array(GRID_SIZE * GRID_SIZE);
        for (const wall of walls) {
            const c = parse(wall);
            wallBlock[c.y * GRID_SIZE + c.x] = 1;
        }

        const fruitAtCell = new Int16Array(GRID_SIZE * GRID_SIZE);
        fruitAtCell.fill(-1);
        currentFruits.forEach((f, i) => { fruitAtCell[f.y * GRID_SIZE + f.x] = i; });
        const targetMask = (1 << currentFruits.length) - 1;

        const queue = [];
        const visited = new Set();
        const startBody = startSnake.map(c => c.y * GRID_SIZE + c.x);
        queue.push({ body: startBody, mask: 0, path: [] });
        visited.add(`${startBody.join('.')}:${0}`);

        while (queue.length) {
            const node = queue.shift();
            for (let di = 0; di < 4; di++) {
                const dir = DIR_ORDER[di];
                const head = node.body[0];
                const hx = head % GRID_SIZE;
                const hy = Math.floor(head / GRID_SIZE);
                const nx = hx + DIRS[dir].x;
                const ny = hy + DIRS[dir].y;
                if (!inBounds(nx, ny)) continue;
                const nIdx = ny * GRID_SIZE + nx;
                if (wallBlock[nIdx]) continue;

                const fruitIdx = fruitAtCell[nIdx];
                const willEat = fruitIdx >= 0 && (node.mask & (1 << fruitIdx)) === 0;
                const collisionBody = willEat ? node.body : node.body.slice(0, -1);
                if (collisionBody.includes(nIdx)) continue;

                const newBody = [nIdx, ...node.body];
                if (!willEat) newBody.pop();
                let newMask = node.mask;
                if (willEat) newMask |= (1 << fruitIdx);
                const path = node.path.concat(dir);
                if (newMask === targetMask) return path;

                const visitKey = `${newBody.join('.')}:${newMask}`;
                if (!visited.has(visitKey)) {
                    visited.add(visitKey);
                    queue.push({ body: newBody, mask: newMask, path });
                }
            }
        }
        return [];
    }

    function getSnakeMove() {
        const cacheKey = stateKey();
        let plan = planCache.get(cacheKey);
        if (!plan) {
            plan = findSnakePlan(cloneSnake(snake), aliveFruits(), puzzle.walls);
            planCache.set(cacheKey, plan);
        }
        if (plan.length > 0) return plan[0];
        for (const dir of DIR_ORDER) {
            const nx = snake[0].x + DIRS[dir].x;
            const ny = snake[0].y + DIRS[dir].y;
            if (!inBounds(nx, ny) || puzzle.walls.has(key(nx, ny))) continue;
            if (snake.slice(0, -1).some(c => c.x === nx && c.y === ny)) continue;
            return dir;
        }
        return null;
    }

    function moveSnake(dir) {
        const nx = snake[0].x + DIRS[dir].x;
        const ny = snake[0].y + DIRS[dir].y;
        if (!inBounds(nx, ny) || puzzle.walls.has(key(nx, ny))) return false;
        const eatIdx = fruitAt(nx, ny);
        const collisionBody = eatIdx >= 0 ? snake : snake.slice(0, -1);
        if (collisionBody.some(c => c.x === nx && c.y === ny)) return false;
        snake.unshift({ x: nx, y: ny });
        if (eatIdx >= 0) fruits[eatIdx].alive = false;
        else snake.pop();
        if (selectedFruitIndex != null && (!fruits[selectedFruitIndex] || !fruits[selectedFruitIndex].alive)) selectedFruitIndex = null;
        return true;
    }

    function tryMoveSelectedFruit(dir) {
        if (selectedFruitIndex == null || !fruits[selectedFruitIndex] || !fruits[selectedFruitIndex].alive) return false;
        const fruit = fruits[selectedFruitIndex];
        const nx = fruit.x + DIRS[dir].x;
        const ny = fruit.y + DIRS[dir].y;
        if (!inBounds(nx, ny) || puzzle.walls.has(key(nx, ny)) || onSnake(nx, ny) || fruitAt(nx, ny, selectedFruitIndex) >= 0) return false;
        fruit.x = nx;
        fruit.y = ny;
        return true;
    }

    function performanceEmoji(turns) {
        if (turns < 5) return '🟥';
        if (turns < 10) return '🟧';
        if (turns < 15) return '🟨';
        if (turns < 20) return '🟩';
        if (turns < 30) return '🟦';
        return '🟪';
    }

    function updateButtons() {
        document.querySelectorAll('[data-dir]').forEach(btn => btn.classList.toggle('pending', btn.dataset.dir === pendingMoveDir));
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

        for (let i = snake.length - 1; i >= 0; i--) {
            const s = snake[i];
            const x = s.x * CELL_SIZE + 6;
            const y = s.y * CELL_SIZE + 6;
            ctx.fillStyle = i === 0 ? '#7ddfdf' : '#126364';
            ctx.fillRect(x, y, CELL_SIZE - 12, CELL_SIZE - 12);
        }
    }

    function refreshMoveGrid() {
        const recent = decisionMoves.slice(-MOVE_GRID_CELLS);
        const offset = MOVE_GRID_CELLS - recent.length;
        for (let i = 0; i < MOVE_GRID_CELLS; i++) {
            const cell = moveCells[i];
            const move = i >= offset ? recent[i - offset] : null;
            if (move) {
                cell.textContent = ARROW[move];
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
        sendButton.disabled = gameOver;
    }

    function sendTurn() {
        if (gameOver) return;
        if (selectedFruitIndex == null) { statusLineEl.textContent = 'Select a fruit first.'; return; }
        if (!pendingMoveDir) { statusLineEl.textContent = 'Choose a direction first.'; return; }

        saveHistory();
        if (!tryMoveSelectedFruit(pendingMoveDir)) { history.pop(); statusLineEl.textContent = 'That fruit move is invalid.'; return; }

        const t0 = performance.now();
        decisionMoves.push(pendingMoveDir);
        turnCount += 1;
        let snakeMovesDone = 0;
        for (let i = 0; i < SNAKE_MOVES_PER_TURN; i++) {
            if (aliveCount() === 0) break;
            const next = getSnakeMove();
            if (!next || !moveSnake(next)) break;
            snakeMovesDone += 1;
        }
        pendingMoveDir = null;
        const ms = Math.round(performance.now() - t0);
        if (aliveCount() === 0) {
            gameOver = true;
            statusLineEl.textContent = `Snake cleared all fruits in ${turnCount} turns. Decision time ${ms}ms.`;
        } else {
            statusLineEl.textContent = `Turn ${turnCount}: snake moved ${snakeMovesDone}/${SNAKE_MOVES_PER_TURN}. Decision time ${ms}ms.`;
        }
        refresh();
    }

    function undoTurn() {
        if (history.length === 0) return;
        restoreHistory(history.pop());
        statusLineEl.textContent = 'Undid last player decision and snake response.';
        refresh();
    }

    function clearPending() {
        pendingMoveDir = null;
        statusLineEl.textContent = 'Pending direction cleared.';
        refresh();
    }

    function shareRun() {
        const remaining = aliveCount();
        const emoji = performanceEmoji(turnCount);
        const share = `Fruitle Day ${dayNumber} Remaining Fruits: ${remaining}/${FRUIT_COUNT} Survived Turns: ${turnCount} ${emoji}\nhttps://egeeken.github.io/fruitle`;
        resultsTextEl.textContent = share;
        resultsModal.style.display = 'flex';
        localStorage.setItem(`fruitle-${dayNumber}`, JSON.stringify({ remaining, turns: turnCount, snakeMovesPerTurn: SNAKE_MOVES_PER_TURN, emoji, at: new Date().toISOString() }));
    }

    document.querySelectorAll('[data-dir]').forEach(btn => btn.addEventListener('click', () => {
        pendingMoveDir = btn.dataset.dir;
        statusLineEl.textContent = selectedFruitIndex == null ? `Direction ${ARROW[pendingMoveDir]} selected. Click a fruit.` : `Direction ${ARROW[pendingMoveDir]} selected. Press ✓ to send turn.`;
        refresh();
    }));
    document.getElementById('undo-move').addEventListener('click', undoTurn);
    document.getElementById('clear-moves').addEventListener('click', clearPending);
    document.getElementById('submit-snakedle').addEventListener('click', shareRun);
    sendButton.addEventListener('click', sendTurn);

    canvas.addEventListener('click', (event) => {
        if (!puzzle || gameOver) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(((event.clientX - rect.left) * (canvas.width / rect.width)) / CELL_SIZE);
        const y = Math.floor(((event.clientY - rect.top) * (canvas.height / rect.height)) / CELL_SIZE);
        const idx = fruitAt(x, y);
        if (idx >= 0) {
            selectedFruitIndex = idx;
            statusLineEl.textContent = pendingMoveDir ? `Fruit selected. Press ✓.` : 'Fruit selected. Choose direction then press ✓.';
            refresh();
        }
    });

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        const map = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L', w: 'U', a: 'L', s: 'D', d: 'R', W: 'U', A: 'L', S: 'D', D: 'R' };
        if (map[e.key]) { e.preventDefault(); pendingMoveDir = map[e.key]; refresh(); return; }
        if (e.key === 'Enter') { e.preventDefault(); sendTurn(); return; }
        if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoTurn(); return; }
        if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { e.preventDefault(); clearPending(); return; }
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
    statusLineEl.textContent = `Daily map loaded in ${Math.round(performance.now() - startMs)}ms. Snake moves ${SNAKE_MOVES_PER_TURN} per turn.`;
    refresh();
})();
