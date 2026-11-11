(() => {
    'use strict';

    const S = window.WeightleSim;
    const $ = id => document.getElementById(id);
    const types = ['pong', 'walker', 'lander'];
    const state = {
        type: 'pong', seed: '', cfg: null, weights: [],
        practice: null, practiceRuns: 0, practiceSpeed: 1, evalSpeed: 1,
        practiceCarry: 0, evalCarry: 0, session: null, sensorCells: [],
        weightInputs: [], lastTelemetry: 0
    };

    const descriptions = {
        pong: {
            Standard: 'Control your paddle and beat three increasingly trained opponents. First to 3 points wins each match.',
            'Inverted bounce': 'Paddle impact angles are reversed: hitting above the center sends the ball downward.',
            'Center gate': 'The middle wall blocks the ball except through an opening. Track the ball and adapt your timing.',
            'Paddle pulse': 'Both paddles periodically shrink and recover while the ball is in play.',
            Sidewind: 'The ball experiences a weak constant vertical acceleration.'
        },
        walker: {
            'Spinning leg': 'Rotate your single powered leg to move across the uneven ground.',
            'Elastic leg': 'A high-speed spring motor extends and retracts your rotating leg.',
            'Reverse joint': 'Motor direction is inverted. Positive commands spin the leg in the opposite direction.',
            'Rough ground': 'The terrain is uneven and foot traction is reduced.'
        },
        lander: {
            Crosswind: 'Continuous wind pushes the craft sideways as it descends.',
            'Low gravity': 'Gravity is weaker, so a small amount of thrust can keep you airborne.',
            'Heavy craft': 'Gravity is stronger and descent control becomes more important.',
            'Moving pad': 'The landing target drifts horizontally while you descend.'
        }
    };

    function randomSeed() {
        const v = new Uint32Array(1);
        crypto.getRandomValues(v);
        return String(v[0]);
    }

    function parseHash() {
        const raw = location.hash.slice(1);
        const colon = raw.indexOf(':');
        if (colon < 1) return null;
        const type = raw.slice(0, colon);
        if (!types.includes(type)) return null;
        try {
            const seed = decodeURIComponent(raw.slice(colon + 1));
            return seed && seed.length <= 60 ? { type, seed } : null;
        } catch (_) {
            return null;
        }
    }

    function loadGame(type, seed, fromHash = false) {
        if (!types.includes(type) || !seed) return;
        if (state.session?.worker) state.session.worker.terminate();
        state.type = type;
        state.seed = String(seed).slice(0, 60);
        state.cfg = S.configFor(type, state.seed);
        state.weights = Array((S.specs[type].inputs.length + 1) * S.specs[type].outputs.length).fill(0);
        state.practice = null;
        state.session = null;
        state.practiceRuns = 0;
        state.practiceCarry = 0;
        state.evalCarry = 0;
        state.practiceSpeed = 1;
        state.evalSpeed = 1;
        $('practice-speed').textContent = 'Speed: 1×';
        $('eval-speed').textContent = 'Speed: 1×';
        $('game-type').value = type;
        $('seed-input').value = state.seed;
        $('seed-label').textContent = 'Seed: ' + state.seed;
        $('variant-name').textContent = S.specs[type].title + ' · ' + state.cfg.variant;
        $('challenge-description').textContent = descriptions[type][state.cfg.variant];
        $('rules').textContent = type === 'pong'
            ? 'Three matches · random → basic training → stronger training · first to 3 points'
            : type === 'walker'
                ? 'Distance milestones: ' + state.cfg.milestones.join(' / ') + ' m · 30-second limit'
                : 'Three landings · increasingly difficult starting positions, wind and landing tolerances';
        $('architecture-label').textContent =
            S.specs[type].inputs.length + ' sensors × ' + S.specs[type].outputs.length + ' motor' +
            (S.specs[type].outputs.length === 1 ? '' : 's') + ' + bias';
        $('practice-status').textContent = 'Ready';
        $('practice-detail').textContent = 'Edit weights and start a practice run.';
        $('practice-note').textContent = type === 'pong'
            ? 'Positive motor output moves the paddle down. Practice uses the same random opponent with different ball trajectories.'
            : type === 'walker'
                ? 'Negative leg motor usually drives forward (positive on reverse-joint days). The spring motor changes leg length.'
                : 'Positive horizontal output moves right; vertical output −1 means no thrust and +1 means full thrust. Practice uses a separate landing.';
        $('practice-btn').textContent = 'Start practice';
        $('evaluation-grid').classList.toggle('single', type === 'walker');
        $('evaluation-heading').textContent = type === 'walker'
            ? 'Reach all three distance markers' : 'Three rounds, one controller';
        $('evaluation-description').textContent = type === 'pong'
            ? 'Win each match to unlock the next opponent. Training takes place only after the previous win.'
            : type === 'walker'
                ? 'One continuous run. Passing 2 m, 5 m and 9 m earns 1, 2 and 3 points.'
                : 'Complete each landing to unlock the next, harder scenario. All use your submitted weights.';
        const labels = type === 'pong'
            ? ['1 · Random opponent', '2 · Basically trained', '3 · Better trained']
            : type === 'walker'
                ? ['Endurance run', '', '']
                : ['1 · Wide landing zone', '2 · Moderate landing', '3 · Precision landing'];
        labels.forEach((label, i) => { $('round-label-' + i).textContent = label; });
        renderWeightEditor();
        resetEvaluation();
        drawBlank($('practice-canvas'), 'Practice simulator');
        setEditorEnabled(true);
        updateTelemetry();
        if (!fromHash) {
            history.replaceState(null, '', location.pathname + location.search +
                '#' + type + ':' + encodeURIComponent(state.seed));
        }
    }

    function drawBlank(canvas, text) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d1a26';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#203747';
        for (let x = 0; x < canvas.width; x += 26) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 26) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
        ctx.fillStyle = '#7899a9';
        ctx.font = '17px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    }

    function renderWeightEditor() {
        const spec = S.specs[state.type];
        const head = $('weights-head'), body = $('weights-body');
        head.replaceChildren(); body.replaceChildren();
        state.sensorCells = [];
        state.weightInputs = [];
        const row = document.createElement('tr');
        const label = document.createElement('th');
        label.textContent = 'Sensor / value';
        row.appendChild(label);
        for (const output of spec.outputs) {
            const th = document.createElement('th');
            th.textContent = output;
            row.appendChild(th);
        }
        head.appendChild(row);
        for (let i = 0; i <= spec.inputs.length; i++) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            const cell = document.createElement('div');
            cell.className = 'sensor-label';
            const name = document.createElement('span');
            name.textContent = i === spec.inputs.length ? 'Bias (always 1)' : spec.inputs[i][0];
            cell.appendChild(name);
            if (i !== spec.inputs.length) {
                const v = document.createElement('span');
                v.className = 'sensor-value';
                v.textContent = '0.00';
                v.title = spec.inputs[i][1];
                state.sensorCells.push(v);
                cell.appendChild(v);
            }
            td.appendChild(cell); tr.appendChild(td);
            for (let j = 0; j < spec.outputs.length; j++) {
                const index = j * (spec.inputs.length + 1) + i;
                const weightCell = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'number';
                input.step = '.1'; input.min = '-6'; input.max = '6';
                input.className = 'weight-input';
                input.value = '0';
                input.setAttribute('aria-label', 'Weight: ' +
                    (i === spec.inputs.length ? 'Bias' : spec.inputs[i][0]) + ' to ' + spec.outputs[j]);
                input.addEventListener('input', () => {
                    if (input.value.trim() === '') return;
                    const value = Number(input.value);
                    if (Number.isFinite(value)) {
                        state.weights[index] = Math.max(-6, Math.min(6, value));
                        updateTelemetry();
                    }
                });
                input.addEventListener('change', () => {
                    const value = Number(input.value);
                    input.value = Number.isFinite(value)
                        ? String(Math.max(-6, Math.min(6, value))) : String(state.weights[index]);
                });
                state.weightInputs.push(input);
                weightCell.appendChild(input);
                tr.appendChild(weightCell);
            }
            body.appendChild(tr);
        }
    }

    function setWeights(weights) {
        state.weights.splice(0, state.weights.length, ...weights);
        const n = S.specs[state.type].inputs.length + 1;
        state.weightInputs.forEach(input => {
            const row = input.parentElement.parentElement.rowIndex - 1;
            const column = input.parentElement.cellIndex - 1;
            input.value = String(Math.round(state.weights[column * n + row] * 100) / 100);
        });
        updateTelemetry();
    }

    function exampleWeights() {
        if (state.type === 'pong') return [3.8, 0, 0, .8, 0, 0, 0];
        if (state.type === 'walker') {
            return [0, 0, 0, 0, 0, 0, 0,
                state.cfg.variant === 'Reverse joint' ? 2.2 : -2.2,
                0, 0, 0, .9, 0, 0, 0, 0];
        }
        return [3, 0, -2, 0, -.6, 0, 0,
            0, -1.2, 0, 2.6, 0, 0, state.cfg.variant === 'Low gravity' ? -.55 : -.3];
    }

    function setEditorEnabled(enabled) {
        for (const input of state.weightInputs) input.disabled = !enabled;
        for (const id of ['zero-weights', 'random-weights', 'baseline-weights', 'practice-btn']) {
            $(id).disabled = !enabled;
        }
    }

    function createPractice() {
        const seed = state.seed + ':practice:' + (++state.practiceRuns);
        if (state.type === 'pong') {
            return S.makePong(state.cfg, seed, state.weights,
                S.randomWeights('pong', state.seed + ':random-opponent'));
        }
        if (state.type === 'walker') return S.makeWalker(state.cfg, seed, state.weights);
        return S.makeLander(state.cfg, seed, state.weights, 0);
    }

    function startPractice() {
        state.practice = createPractice();
        state.practiceCarry = 0;
        $('practice-btn').textContent = 'Restart practice';
        $('practice-status').textContent = 'Running';
        $('practice-detail').textContent = 'Watch your current network control the simulation.';
        state.practice.draw($('practice-canvas').getContext('2d'));
        updateTelemetry();
    }

    function updateTelemetry() {
        const active = state.practice && !state.practice.done
            ? state.practice : state.session?.sim;
        const inputs = active ? active.getSensors() : Array(S.specs[state.type].inputs.length).fill(0);
        state.sensorCells.forEach((el, i) => { el.textContent = inputs[i].toFixed(2); });
        const actions = S.forward(state.type, state.weights, inputs);
        const panel = $('actions-live');
        panel.replaceChildren();
        S.specs[state.type].outputs.forEach((name, i) => {
            const cell = document.createElement('div');
            cell.className = 'action-meter';
            const title = document.createElement('span'), value = document.createElement('strong');
            title.textContent = name;
            value.textContent = actions[i].toFixed(2);
            cell.append(title, value); panel.appendChild(cell);
        });
    }

    function setOverlay(i, heading, className = '', progress = null, subtext = '') {
        const el = $('round-overlay-' + i);
        el.hidden = heading === null;
        el.className = 'round-overlay' + (className ? ' ' + className : '');
        el.replaceChildren();
        if (heading === null) return;
        const strong = document.createElement('strong');
        strong.textContent = heading;
        el.appendChild(strong);
        if (progress) {
            const bar = document.createElement('progress');
            bar.value = progress.current;
            bar.max = progress.total;
            el.appendChild(bar);
        }
        if (subtext) {
            const small = document.createElement('small');
            small.textContent = subtext;
            el.appendChild(small);
        }
    }

    function setRoundStatus(i, value, className = '') {
        const el = $('round-status-' + i);
        el.textContent = value;
        el.className = 'round-status' + (className ? ' ' + className : '');
    }

    function resetEvaluation() {
        $('final-score').textContent = 'Not submitted';
        $('evaluation-message').textContent =
            'Practice as much as you like. A submission locks your weights for the full run.';
        $('submit-btn').hidden = false;
        $('submit-btn').disabled = false;
        $('retry-btn').hidden = true;
        for (let i = 0; i < 3; i++) {
            setRoundStatus(i, 'Locked');
            setOverlay(i, i === 0 ? 'Ready' : 'Locked');
            $('round-detail-' + i).textContent = i === 0
                ? 'Waiting for submission' : 'Beat the previous round to unlock';
            drawBlank($('eval-canvas-' + i), 'Round ' + (i + 1));
        }
    }

    function startEvaluation() {
        if (state.session && !state.session.finished) return;
        state.practice = null;
        $('practice-status').textContent = 'Paused';
        $('submit-btn').hidden = true;
        $('retry-btn').hidden = true;
        setEditorEnabled(false);
        const session = {
            type: state.type, seed: state.seed, weights: state.weights.slice(),
            current: 0, score: 0, sim: null, worker: null, basic: null, finished: false
        };
        state.session = session;
        state.evalCarry = 0;
        $('final-score').textContent = 'Running · 0/3';
        $('evaluation-message').textContent = 'Evaluating the submitted weights.';
        startRound(session, 0);
    }

    function startRound(session, round) {
        if (state.session !== session || session.finished) return;
        session.current = round;
        session.sim = null;
        if (session.type === 'pong' && round > 0) {
            trainOpponent(session, round);
            return;
        }
        beginRoundSimulation(session, round, null);
    }

    function trainOpponent(session, round) {
        const phase = round === 1 ? 'basic' : 'strong';
        const total = phase === 'basic' ? 70 : 420;
        setRoundStatus(round, 'Training');
        setOverlay(round, 'Training ' + (phase === 'basic' ? 'basic' : 'stronger') + ' network',
            '', { current: 0, total }, '0 / ' + total + ' iterations');
        $('round-detail-' + round).textContent = 'Evolving an opponent in a background worker...';
        $('evaluation-message').textContent = 'Training the next opponent. Your weights remain locked.';
        try {
            const worker = new Worker('trainer.js');
            session.worker = worker;
            worker.onmessage = function ({ data }) {
                if (state.session !== session || session.finished) { worker.terminate(); return; }
                if (data.kind === 'progress') {
                    setOverlay(round, 'Training ' + (phase === 'basic' ? 'basic' : 'stronger') + ' network',
                        '', { current: data.current, total: data.total },
                        data.current + ' / ' + data.total + ' iterations');
                }
                if (data.kind === 'complete') {
                    worker.terminate();
                    session.worker = null;
                    if (phase === 'basic') session.basic = data.weights;
                    $('round-detail-' + round).textContent =
                        'Training completed in ' + data.elapsed + ' ms · loss ' + data.loss.toFixed(3);
                    beginRoundSimulation(session, round, data.weights);
                }
            };
            worker.onerror = function () {
                worker.terminate();
                session.worker = null;
                session.finished = true;
                setRoundStatus(round, 'Training error', 'failure');
                setOverlay(round, 'Training failed', 'failure');
                $('evaluation-message').textContent = 'The training worker failed. Retry the challenge.';
                $('retry-btn').hidden = false;
                setEditorEnabled(true);
            };
            worker.postMessage({
                seed: session.seed, cfg: state.cfg, phase,
                previous: round === 2 ? session.basic : null
            });
        } catch (error) {
            session.finished = true;
            setOverlay(round, 'Training unavailable', 'failure');
            $('evaluation-message').textContent = error.message;
            $('retry-btn').hidden = false;
            setEditorEnabled(true);
        }
    }

    function beginRoundSimulation(session, round, opponent) {
        if (state.session !== session) return;
        let sim;
        if (session.type === 'pong') {
            sim = S.makePong(state.cfg, session.seed + ':eval:' + round,
                session.weights, opponent || S.randomWeights('pong', session.seed + ':random-opponent'));
        } else if (session.type === 'lander') {
            sim = S.makeLander(state.cfg, session.seed + ':eval:' + round, session.weights, round);
        } else {
            sim = S.makeWalker(state.cfg, session.seed + ':eval', session.weights);
        }
        session.sim = sim;
        state.evalCarry = 0;
        setRoundStatus(round, 'Playing');
        setOverlay(round, null);
        $('evaluation-message').textContent = session.type === 'pong'
            ? 'Round ' + (round + 1) + ': first to 3 points.'
            : session.type === 'lander'
                ? 'Landing ' + (round + 1) + ': remain inside the pad and slow down before contact.'
                : 'Reach the three markers before the 30-second limit.';
        sim.draw($('eval-canvas-' + round).getContext('2d'));
    }

    function finishRound(session) {
        if (state.session !== session || session.finished) return;
        const i = session.current, sim = session.sim;
        session.sim = null;
        if (session.type === 'walker') {
            session.score = state.cfg.milestones.filter(d => sim.best >= d).length;
            setRoundStatus(0, session.score === 3 ? 'Completed' : 'Stopped',
                session.score === 3 ? 'success' : 'failure');
            setOverlay(0, session.score === 3 ? 'All milestones reached' : 'Run finished',
                session.score === 3 ? 'success' : 'failure',
                null, sim.best.toFixed(2) + ' m · ' + session.score + '/3');
            $('round-detail-0').textContent = 'Best distance: ' + sim.best.toFixed(2) + ' m';
            finishEvaluation(session);
            return;
        }
        if (sim.win) {
            session.score++;
            setRoundStatus(i, 'Won', 'success');
            setOverlay(i, 'Victory', 'success',
                null, session.type === 'pong' ? sim.score.join(' – ') : 'Landing successful');
            $('round-detail-' + i).textContent = session.type === 'pong'
                ? 'Final score: ' + sim.score[0] + ' – ' + sim.score[1]
                : 'Landed safely on the pad';
            $('final-score').textContent = 'Running · ' + session.score + '/3';
            if (i < 2) {
                startRound(session, i + 1);
                return;
            }
        } else {
            setRoundStatus(i, 'Failed', 'failure');
            setOverlay(i, session.type === 'pong' ? 'Defeat' : 'Landing failed',
                'failure', null, session.type === 'pong'
                    ? sim.score.join(' – ') : 'Missed the pad, landed too fast, or timed out');
            $('round-detail-' + i).textContent = session.type === 'pong'
                ? 'Final score: ' + sim.score[0] + ' – ' + sim.score[1]
                : 'Try a different controller';
        }
        finishEvaluation(session);
    }

    function finishEvaluation(session) {
        session.finished = true;
        session.sim = null;
        if (session.worker) { session.worker.terminate(); session.worker = null; }
        $('final-score').textContent = 'Result: ' + session.score + '/3';
        $('evaluation-message').textContent = session.score === 3
            ? 'Perfect result. All three stages passed.'
            : 'Evaluation complete. Change weights and retry, or share this seed.';
        $('retry-btn').hidden = false;
        setEditorEnabled(true);
        const key = 'weightle:' + session.type + ':' + session.seed;
        try {
            const old = JSON.parse(localStorage.getItem(key) || 'null');
            if (!old || session.score >= old.score) {
                localStorage.setItem(key, JSON.stringify({
                    score: session.score, weights: session.weights, at: new Date().toISOString()
                }));
            }
        } catch (_) {
            // Storage is optional.
        }
    }

    function updatePracticeLabel() {
        const p = state.practice;
        if (!p) return;
        if (p.type === 'pong') {
            $('practice-detail').textContent = 'You ' + p.score[0] + ' : ' +
                p.score[1] + ' random · ' + (p.frame / 60).toFixed(1) + ' s';
        } else if (p.type === 'walker') {
            $('practice-detail').textContent = 'Distance ' + p.best.toFixed(2) +
                ' m · ' + (p.frame / 60).toFixed(1) + ' s';
        } else {
            $('practice-detail').textContent =
                'Horizontal speed ' + p.vx.toFixed(2) +
                ' · Descent speed ' + p.vy.toFixed(2) + ' · ' + (p.frame / 60).toFixed(1) + ' s';
        }
        if (p.done) $('practice-status').textContent = p.win ? 'Success' : 'Finished';
    }

    function updateRoundLabel() {
        const session = state.session;
        if (!session || !session.sim || session.finished) return;
        const s = session.sim, i = session.current;
        if (session.type === 'pong') {
            $('round-detail-' + i).textContent =
                'You ' + s.score[0] + ' : ' + s.score[1] + ' opponent · ' +
                (s.frame / 60).toFixed(1) + ' s';
        } else if (session.type === 'walker') {
            $('round-detail-0').textContent = 'Distance ' + s.best.toFixed(2) +
                ' m · next marker ' + (state.cfg.milestones.find(d => d > s.best) || 'finish');
        } else {
            $('round-detail-' + i).textContent = 'Altitude ' + (.87 - s.y).toFixed(2) +
                ' · velocity ' + s.vy.toFixed(2);
        }
    }

    function advance(sim, carryKey, elapsed, multiplier, onComplete) {
        if (!sim || sim.done) return;
        state[carryKey] += elapsed * multiplier;
        let steps = 0;
        while (state[carryKey] >= S.DT && steps < 48 && !sim.done) {
            sim.step();
            state[carryKey] -= S.DT;
            steps++;
        }
        if (sim.done && onComplete) onComplete();
    }

    let lastFrame = 0;
    function animationFrame(now) {
        const elapsed = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 0;
        lastFrame = now;
        const practice = state.practice;
        if (practice && !practice.done) {
            advance(practice, 'practiceCarry', elapsed, state.practiceSpeed,
                () => updatePracticeLabel());
            practice.draw($('practice-canvas').getContext('2d'));
        }
        const session = state.session;
        if (session && session.sim && !session.finished) {
            const sim = session.sim, round = session.current;
            advance(sim, 'evalCarry', elapsed, state.evalSpeed, () => {
                sim.draw($('eval-canvas-' + round).getContext('2d'));
                finishRound(session);
            });
            if (!sim.done) sim.draw($('eval-canvas-' + round).getContext('2d'));
        }
        if (now - state.lastTelemetry > 160) {
            state.lastTelemetry = now;
            if ((state.practice && !state.practice.done) || (state.session?.sim && !state.session.finished)) {
                updateTelemetry();
            }
            if (state.practice && !state.practice.done) updatePracticeLabel();
            if (state.session?.sim && !state.session.finished) updateRoundLabel();
        }
        requestAnimationFrame(animationFrame);
    }

    function cycleSpeed(key, id) {
        const next = state[key] === 1 ? 4 : state[key] === 4 ? 12 : 1;
        state[key] = next;
        $(id).textContent = 'Speed: ' + next + '×';
    }

    $('game-type').addEventListener('change', () => loadGame($('game-type').value, state.seed || randomSeed()));
    $('random-game').addEventListener('click', () => loadGame($('game-type').value, randomSeed()));
    $('specific-seed').addEventListener('click', () => {
        const seed = $('seed-input').value.trim();
        if (!seed) { $('seed-input').focus(); return; }
        loadGame($('game-type').value, seed);
    });
    $('seed-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('specific-seed').click();
    });
    $('copy-link').addEventListener('click', async () => {
        const button = $('copy-link'), value = location.href;
        try {
            await navigator.clipboard.writeText(value);
            button.textContent = 'Link copied';
        } catch (_) {
            const input = $('seed-input');
            input.focus(); input.select();
            button.textContent = 'Copy the URL from the address bar';
        }
        setTimeout(() => { button.textContent = 'Copy link'; }, 2000);
    });
    $('practice-btn').addEventListener('click', startPractice);
    $('practice-speed').addEventListener('click', () => cycleSpeed('practiceSpeed', 'practice-speed'));
    $('eval-speed').addEventListener('click', () => cycleSpeed('evalSpeed', 'eval-speed'));
    $('zero-weights').addEventListener('click', () => setWeights(Array(state.weights.length).fill(0)));
    $('random-weights').addEventListener('click', () =>
        setWeights(S.randomWeights(state.type, state.seed + ':weights:' + Date.now())));
    $('baseline-weights').addEventListener('click', () => setWeights(exampleWeights()));
    $('submit-btn').addEventListener('click', startEvaluation);
    $('retry-btn').addEventListener('click', () => {
        state.session = null;
        resetEvaluation();
        $('evaluation-message').textContent = 'Weights are editable again. Submit to try another run.';
        setEditorEnabled(true);
    });
    window.addEventListener('hashchange', () => {
        const link = parseHash();
        if (link && (link.type !== state.type || link.seed !== state.seed)) {
            loadGame(link.type, link.seed, true);
        }
    });

    const link = parseHash();
    if (link) loadGame(link.type, link.seed, true);
    else loadGame('pong', randomSeed());
    requestAnimationFrame(animationFrame);
})();
