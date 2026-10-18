(() => {
    'use strict';

    const axes = [
        { key: 'small', name: 'Guaranteed money', min: 1000, max: 10000000, log: true },
        { key: 'big', name: 'Jackpot', min: 10000, max: 1000000000000, log: true },
        { key: 'odds', name: 'Win probability', min: 1, max: 99, log: false }
    ];
    const defaults = [50000, 50000000, 50];
    const $ = id => document.getElementById(id);
    const canvas = $('plot');
    const ctx = canvas.getContext('2d');
    const state = {
        mode: 2, x: 1, y: 2, fixed: defaults.slice(),
        answers: [], question: null, yaw: .75, pitch: .55, zoom: 1,
        dragging: false, lastX: 0, lastY: 0, scheduled: false, surface: null
    };
    let playOutcome = null;
    let playBusy = false;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const money = n => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 4 }).format(n);
    const percent = n => Number(n.toFixed(2)) + '%';
    const axisText = (i, n) => i === 2 ? percent(n) : money(n);
    const rawPosition = (i, v) => {
        const a = axes[i];
        return a.log ? Math.log(v / a.min) / Math.log(a.max / a.min) : (v - a.min) / (a.max - a.min);
    };
    const rawValue = (i, t) => {
        const a = axes[i];
        const v = a.log ? a.min * Math.pow(a.max / a.min, t) : a.min + (a.max - a.min) * t;
        return i === 2 ? Math.round(v * 100) / 100 : Math.round(v);
    };
    const toU = v => [1 - rawPosition(0, v[0]), rawPosition(1, v[1]), rawPosition(2, v[2])];
    const fromU = u => [rawValue(0, 1 - u[0]), rawValue(1, u[1]), rawValue(2, u[2])];
    const activeAxes = () => state.mode === 3 ? [0, 1, 2] : state.mode === 2 ? [state.x, state.y] : [state.x];
    const fixedU = () => toU(state.fixed);
    const candidate = coords => {
        const u = fixedU();
        activeAxes().forEach((axis, i) => { u[axis] = coords[i]; });
        return toU(fromU(u));
    };
    const validValues = v => Array.isArray(v) && v.length === 3 &&
        v.every((x, i) => Number.isFinite(x) && x >= axes[i].min && x <= axes[i].max);

    function inference(u) {
        for (const a of state.answers) {
            if (a.flip && u.every((v, i) => v >= a.u[i] - 1e-10)) return 1;
            if (!a.flip && u.every((v, i) => v <= a.u[i] + 1e-10)) return -1;
        }
        return 0;
    }

    function field(u) {
        let df = Infinity, dt = Infinity;
        let flips = 0, takes = 0;
        for (const a of state.answers) {
            let distance = 0;
            for (let i = 0; i < 3; i++) {
                const d = a.flip ? Math.max(0, a.u[i] - u[i]) : Math.max(0, u[i] - a.u[i]);
                distance += d * d;
            }
            if (a.flip) { df = Math.min(df, distance); flips++; }
            else { dt = Math.min(dt, distance); takes++; }
        }
        if (!flips) df = u.reduce((s, v) => s + (1 - v) ** 2, 0) * .65;
        if (!takes) dt = u.reduce((s, v) => s + v ** 2, 0) * .65;
        df = Math.sqrt(df);
        dt = Math.sqrt(dt);
        return (dt - df) / (dt + df + 1e-9);
    }

    const halton = (index, base) => {
        let f = 1, result = 0;
        while (index > 0) { f /= base; result += f * (index % base); index = Math.floor(index / base); }
        return result;
    };

    function nextQuestion() {
        const dims = activeAxes();
        if (state.mode === 1) {
            const axis = dims[0], anchor = fixedU();
            let lower = 0, upper = 1;
            for (const a of state.answers) {
                if (a.flip &&
                    a.u.every((v, i) => i === axis || anchor[i] >= v - 1e-10)) upper = Math.min(upper, a.u[axis]);
                if (!a.flip && a.u.every((v, i) => i === axis || anchor[i] <= v + 1e-10)) lower = Math.max(lower, a.u[axis]);
            }
            for (const fraction of [.5, .37, .63, .2, .8]) {
                const u = anchor.slice();
                u[axis] = lower + (upper - lower) * fraction;
                const rounded = toU(fromU(u));
                if (inference(rounded) === 0 && !state.answers.some(a => a.u.every((v, i) => Math.abs(v - rounded[i]) < 1e-10))) return rounded;
            }
            return null;
        }
        if (state.answers.length === 0) return candidate(dims.map(() => .5));
        const bases = [2, 3, 5];
        let best = null, bestScore = -Infinity;
        const count = state.mode === 3 ? 1050 : 650;
        for (let index = 1; index <= count; index++) {
            const coords = dims.map((_, i) => .015 + .97 * halton(index + state.answers.length * 17, bases[i]));
            const u = candidate(coords);
            if (inference(u) !== 0) continue;
            if (state.answers.some(a => a.u.every((v, i) => Math.abs(v - u[i]) < 1e-9))) continue;
            let nearest = Infinity;
            for (const a of state.answers) {
                let d = 0;
                for (const axis of dims) d += (a.u[axis] - u[axis]) ** 2;
                nearest = Math.min(nearest, d);
            }
            const novelty = clamp(Math.sqrt(nearest / dims.length) * 2.25, 0, 1);
            const nearBoundary = 1 - Math.abs(field(u));
            const priority = .67 * nearBoundary + .33 * novelty;
            if (priority > bestScore) { bestScore = priority; best = u; }
        }
        return best;
    }

    function saveAnswers() {
        try { localStorage.setItem('breaking-point-answers-v1', JSON.stringify(state.answers.map(a => [a.v, a.flip]))); }
        catch (_) { /* Browser storage can be disabled. */ }
    }
    function loadAnswers() {
        try {
            const rows = JSON.parse(localStorage.getItem('breaking-point-answers-v1') || '[]');
            if (!Array.isArray(rows)) return;
            for (const row of rows.slice(0, 2000)) {
                if (!Array.isArray(row) || !validValues(row[0]) || typeof row[1] !== 'boolean') continue;
                const a = { v: row[0], u: toU(row[0]), flip: row[1] };
                if (inference(a.u) === 0) state.answers.push(a);
            }
        } catch (_) { /* Ignore corrupt or unavailable storage. */ }
    }

    function respond(flip) {
        if (!state.question) return;
        const u = state.question;
        if (inference(u) !== 0) { refresh(); return; }
        const v = fromU(u);
        state.answers.push({ v, u: toU(v), flip });
        saveAnswers();
        refresh();
    }
    function refresh() {
        state.surface = null;
        state.question = nextQuestion();
        $('answer-count').textContent = state.answers.length;
        $('undo-answer').disabled = state.answers.length === 0;
        const q = state.question;
        $('quiz-take').disabled = !q;
        $('quiz-flip').disabled = !q;
        if (q) {
            const v = fromU(q);
            $('quiz-small').textContent = money(v[0]);
            $('quiz-big').textContent = money(v[1]);
            $('quiz-odds').textContent = percent(v[2]) + ' chance';
            $('quiz-caption').textContent = 'Which would you choose?';
            $('quiz-status').textContent = state.answers.length + ' answered · Only unresolved offers are asked';
        } else {
            $('quiz-caption').textContent = 'This slice is resolved to the available precision.';
            $('quiz-status').textContent = 'Change the axes or fixed values to explore more.';
        }
        const active = activeAxes();
        $('plot-heading').textContent = state.mode + 'D decision boundary';
        $('plot-subtitle').textContent = active.map(i => axes[i].name).join(' · ');
        $('plot-empty').hidden = state.answers.length > 0;
        $('plot-hint').textContent = state.mode === 3
            ? 'Drag to rotate · Scroll to zoom · The surface is an estimate.'
            : 'Lighter color is estimated; stronger color follows logically.';
        $('plot-holder').style.touchAction = state.mode === 3 ? 'none' : 'pan-y';
        $('plot-holder').style.cursor = state.mode === 3 ? 'grab' : 'default';
        scheduleDraw();
    }

    function configureAxes() {
        const showX = state.mode !== 3, showY = state.mode === 2;
        $('axis-x-group').hidden = !showX;
        $('axis-y-group').hidden = !showY;
        $('axis-x-label').textContent = state.mode === 1 ? 'Variable' : 'Horizontal axis';
        $('axis-x').value = axes[state.x].key;
        $('axis-y').value = axes[state.y].key;
        for (const btn of document.querySelectorAll('[data-mode]')) btn.setAttribute('aria-pressed', String(Number(btn.dataset.mode) === state.mode));
        const holder = $('fixed-controls');
        holder.replaceChildren();
        for (let i = 0; i < 3; i++) {
            if (activeAxes().includes(i)) continue;
            const row = document.createElement('div');
            row.className = 'fixed-control';
            const label = document.createElement('label');
            const id = 'fixed-' + i;
            label.htmlFor = id;
            label.textContent = axes[i].name + ' (fixed)';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = id;
            slider.min = 0; slider.max = 1000; slider.step = 1;
            slider.value = String(Math.round(rawPosition(i, state.fixed[i]) * 1000));
            const value = document.createElement('output');
            value.textContent = axisText(i, state.fixed[i]);
            slider.addEventListener('input', () => {
                state.fixed[i] = rawValue(i, Number(slider.value) / 1000);
                value.textContent = axisText(i, state.fixed[i]);
                refresh();
            });
            row.append(label, slider, value);
            holder.append(row);
        }
        refresh();
    }

    function scheduleDraw() {
        if (state.scheduled) return;
        state.scheduled = true;
        requestAnimationFrame(() => { state.scheduled = false; draw(); });
    }

    function dimensions() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(200, rect.width), h = Math.max(200, rect.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { w, h };
    }
    function line(x1, y1, x2, y2, color, width = 1) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    function label(text, x, y, align = 'center', color = '#b7cdd5', size = 11) {
        ctx.fillStyle = color;
        ctx.font = '600 ' + size + 'px Futura, system-ui, sans-serif';
        ctx.textAlign = align;
        ctx.fillText(text, x, y);
    }
    function dot(x, y, flip, radius = 5) {
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = flip ? '#50cfbe' : '#f08886';
        ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
    }
    function frame(w, h, padLeft = 77, padBottom = 61) {
        const l = Math.min(padLeft, w * .2), r = w - 27, t = 37, b = h - padBottom;
        return { l, r, t, b, pw: r - l, ph: b - t };
    }
    function grid2D(f, ax, ay) {
        ctx.fillStyle = 'rgba(124,166,185,.035)';
        ctx.fillRect(f.l, f.t, f.pw, f.ph);
        for (let n = 0; n <= 4; n++) {
            const t = n / 4, x = f.l + f.pw * t, y = f.b - f.ph * t;
            line(x, f.t, x, f.b, 'rgba(173,202,216,.13)');
            line(f.l, y, f.r, y, 'rgba(173,202,216,.13)');
            label(axisText(ax, rawValue(ax, t)), x, f.b + 20);
            if (ay !== null) label(axisText(ay, rawValue(ay, t)), f.l - 9, y + 4, 'right');
        }
        line(f.l, f.b, f.r, f.b, '#8daebb', 1.5);
        if (ay !== null) line(f.l, f.t, f.l, f.b, '#8daebb', 1.5);
        label(axes[ax].name, (f.l + f.r) / 2, f.b + 46, 'center', '#e1f1f0', 12);
        if (ay !== null) {
            ctx.save();
            ctx.translate(17, (f.t + f.b) / 2);
            ctx.rotate(-Math.PI / 2);
            label(axes[ay].name, 0, 0, 'center', '#e1f1f0', 12);
            ctx.restore();
        }
    }
    function plot1D(w, h) {
        const f = frame(w, h, 73, 86), axis = state.x, u0 = fixedU();
        const top = f.t + f.ph * .37, height = Math.max(48, f.ph * .27);
        const n = 220;
        if (state.answers.length) for (let j = 0; j < n; j++) {
            const u = u0.slice(); u[axis] = axis === 0 ? 1 - (j + .5) / n : (j + .5) / n;
            const s = field(u), certain = inference(u) !== 0;
            ctx.fillStyle = s >= 0 ? (certain ? 'rgba(52,182,168,.84)' : 'rgba(52,182,168,.32)')
                : (certain ? 'rgba(204,97,105,.84)' : 'rgba(204,97,105,.32)');
            ctx.fillRect(f.l + j * f.pw / n, top, f.pw / n + 1, height);
        }
        ctx.strokeStyle = '#83a5b3'; ctx.strokeRect(f.l, top, f.pw, height);
        if (state.answers.length) {
            let prev = null, crossing = null;
            for (let j = 0; j <= n; j++) {
                const u = u0.slice(); u[axis] = axis === 0 ? 1 - j / n : j / n;
                const sign = field(u);
                if (prev !== null && ((prev < 0 && sign >= 0) || (prev >= 0 && sign < 0))) { crossing = j / n; break; }
                prev = sign;
            }
            if (crossing !== null) {
                const x = f.l + crossing * f.pw;
                line(x, top - 18, x, top + height + 16, '#fff', 2);
                label('Estimated switch', clamp(x, f.l + 57, f.r - 57), top - 25, 'center', '#fff', 11);
            }
        }
        const uFixed = fixedU();
        for (const a of state.answers) {
            if (a.u.every((v, i) => i === axis || Math.abs(v - uFixed[i]) < .002)) {
                const t = rawPosition(axis, a.v[axis]);
                dot(f.l + t * f.pw, top + height / 2, a.flip, 6);
            }
        }
        grid2D({ ...f, t: top + height + 27, b: top + height + 27, ph: 0 }, axis, null);
        if (state.answers.length) {
            const edge = t => {
                const u = u0.slice();
                u[axis] = axis === 0 ? 1 - t : t;
                return field(u) >= 0 ? 'FLIP' : 'TAKE';
            };
            label(edge(0), f.l + 9, top - 10, 'left', '#d2e9e7', 10);
            label(edge(1), f.r - 9, top - 10, 'right', '#d2e9e7', 10);
        }
    }
    function plot2D(w, h) {
        const f = frame(w, h, 83, 65);
        const nx = 75, ny = 49, data = new Float64Array((nx + 1) * (ny + 1));
        const uFixed = fixedU();
        const at = (i, j) => {
            const u = uFixed.slice();
            u[state.x] = state.x === 0 ? 1 - i / nx : i / nx;
            u[state.y] = state.y === 0 ? 1 - j / ny : j / ny;
            return u;
        };
        if (state.answers.length) {
            for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
                data[j * (nx + 1) + i] = field(at(i, j));
            }
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                const u = at(i + .5, j + .5);
                const val = field(u), certain = inference(u) !== 0;
                ctx.fillStyle = val >= 0 ? (certain ? 'rgba(50,170,157,.62)' : 'rgba(50,170,157,.20)')
                    : (certain ? 'rgba(199,86,96,.62)' : 'rgba(199,86,96,.20)');
                ctx.fillRect(f.l + i * f.pw / nx, f.b - (j + 1) * f.ph / ny, f.pw / nx + 1, f.ph / ny + 1);
            }
        }
        grid2D(f, state.x, state.y);
        if (state.answers.length) {
            ctx.strokeStyle = '#e3f6f0'; ctx.lineWidth = 2.1;
            ctx.beginPath();
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                const a = data[j * (nx + 1) + i], b = data[j * (nx + 1) + i + 1];
                const c = data[(j + 1) * (nx + 1) + i + 1], d = data[(j + 1) * (nx + 1) + i];
                const edges = [];
                const cross = (v1, v2, x1, y1, x2, y2) => {
                    if ((v1 < 0) === (v2 < 0)) return;
                    const t = v1 / (v1 - v2);
                    edges.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
                };
                cross(a, b, i, j, i + 1, j);
                cross(b, c, i + 1, j, i + 1, j + 1);
                cross(c, d, i + 1, j + 1, i, j + 1);
                cross(d, a, i, j + 1, i, j);
                for (let k = 0; k + 1 < edges.length; k += 2) {
                    ctx.moveTo(f.l + edges[k][0] * f.pw / nx, f.b - edges[k][1] * f.ph / ny);
                    ctx.lineTo(f.l + edges[k + 1][0] * f.pw / nx, f.b - edges[k + 1][1] * f.ph / ny);
                }
            }
            ctx.stroke();
        }
        for (const a of state.answers) {
            if (a.u.every((v, i) => i === state.x || i === state.y || Math.abs(v - uFixed[i]) < .002)) {
                dot(f.l + rawPosition(state.x, a.v[state.x]) * f.pw,
                    f.b - rawPosition(state.y, a.v[state.y]) * f.ph, a.flip, 5.5);
            }
        }
    }

    function plot3D(w, h) {
        const scale = Math.min(w * .49, h * .56) * state.zoom;
        const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
        const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
        function project(v) {
            const x = v[0] - .5, y = v[1] - .5, z = v[2] - .5;
            const rx = x * c - y * s, ry = x * s + y * c;
            return { x: w * .5 + scale * rx, y: h * .53 - scale * (z * cp - ry * sp), depth: ry * cp + z * sp };
        }
        const corners = [];
        for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) corners.push(project([x, y, z]));
        for (let a = 0; a < 8; a++) for (let axis = 0; axis < 3; axis++) {
            const b = a ^ (1 << axis);
            if (a < b) line(corners[a].x, corners[a].y, corners[b].x, corners[b].y, 'rgba(166,201,211,.32)', 1);
        }
        const n = 23;
        if (state.answers.length && !state.surface) {
            const surface = Array.from({ length: n + 1 }, () => Array(n + 1).fill(null));
            for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
                const sx = i / n, by = j / n;
                let lo = 0, hi = 1;
                const low = field([1 - sx, by, lo]), high = field([1 - sx, by, hi]);
                if (low > 0 || high < 0) continue;
                for (let k = 0; k < 14; k++) {
                    const mid = (lo + hi) / 2;
                    if (field([1 - sx, by, mid]) >= 0) hi = mid;
                    else lo = mid;
                }
                surface[i][j] = [sx, by, (lo + hi) / 2];
            }
            state.surface = surface;
        }
        if (state.answers.length) {
            const verts = state.surface.map(row => row.map(v => v && project(v)));
            const triangles = [];
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const a = verts[i][j], b = verts[i + 1][j], c2 = verts[i + 1][j + 1], d = verts[i][j + 1];
                if (a && b && c2) triangles.push([a, b, c2]);
                if (a && c2 && d) triangles.push([a, c2, d]);
                if (!a && b && c2 && d) triangles.push([b, c2, d]);
                if (a && b && !c2 && d) triangles.push([a, b, d]);
            }
            triangles.sort((a, b) => (b[0].depth + b[1].depth + b[2].depth) - (a[0].depth + a[1].depth + a[2].depth));
            for (const t of triangles) {
                ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y);
                ctx.lineTo(t[1].x, t[1].y); ctx.lineTo(t[2].x, t[2].y); ctx.closePath();
                ctx.fillStyle = 'rgba(55,177,163,.64)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(179,241,228,.16)';
                ctx.lineWidth = .6; ctx.stroke();
            }
        }
        const origin = project([0, 0, 0]);
        for (let axis = 0; axis < 3; axis++) {
            const end = [0, 0, 0]; end[axis] = 1;
            const pEnd = project(end);
            line(origin.x, origin.y, pEnd.x, pEnd.y, '#d4e8e9', 1.8);
            for (const t of [0, .25, .5, .75, 1]) {
                end[axis] = t;
                const p = project(end);
                const tickDx = axis === 2 ? 7 : 0, tickDy = axis === 2 ? 0 : 5;
                line(p.x - tickDx, p.y - tickDy, p.x + tickDx, p.y + tickDy, '#bdcfd6');
                if (t === 0 || t === .5 || t === 1) {
                    const dx = axis === 2 ? -12 : axis === 1 ? 8 : -8;
                    const dy = axis === 2 ? 4 : 18;
                    const a = axisText(axis, rawValue(axis, t));
                    label(a, p.x + dx, p.y + dy, axis === 2 ? 'right' : 'center', '#dae9ec', 10);
                }
            }
            const offsetX = axis === 2 ? 22 : axis === 1 ? 22 : -20;
            const offsetY = axis === 2 ? -7 : 30;
            label(axes[axis].name, pEnd.x + offsetX, pEnd.y + offsetY,
                axis === 2 ? 'left' : 'center', '#9be2d9', 11);
        }
        const points = state.answers.map(a => {
            const p = project([rawPosition(0, a.v[0]), rawPosition(1, a.v[1]), rawPosition(2, a.v[2])]);
            return { ...p, flip: a.flip };
        }).sort((a, b) => b.depth - a.depth);
        for (const p of points) dot(p.x, p.y, p.flip, 5.5);
        if (!state.answers.length) label('Rotate by dragging once your boundary appears', w / 2, h - 14, 'center', '#8ea6ae', 11);
    }

    function draw() {
        if (!ctx) return;
        const { w, h } = dimensions();
        ctx.clearRect(0, 0, w, h);
        if (state.mode === 1) plot1D(w, h);
        else if (state.mode === 2) plot2D(w, h);
        else plot3D(w, h);
    }

    function playValues() { return [Number($('play-small').value), Number($('play-big').value), Number($('play-odds').value)]; }
    function syncPlay() {
        const v = playValues();
        const valid = validValues(v);
        $('play-error').hidden = valid;
        $('play-error').textContent = 'Enter values within the ranges shown for each offer.';
        $('play-take').disabled = !valid || playBusy;
        $('play-flip').disabled = !valid || playBusy;
        $('take-label').textContent = Number.isFinite(v[0]) ? money(v[0]) : '—';
        $('flip-label').textContent = Number.isFinite(v[1]) && Number.isFinite(v[2]) ? percent(v[2]) + ' for ' + money(v[1]) : '—';
        return valid;
    }
    function showOutcome() {
        if (!playOutcome) { $('play-result').hidden = true; return; }
        const { choice, won, v } = playOutcome;
        $('play-result').hidden = false;
        $('coin').classList.remove('spinning');
        $('coin').textContent = choice === 'take' ? '$' : won ? '✓' : '×';
        $('result-title').textContent = choice === 'take' ? 'You took ' + money(v[0]) + '.'
            : won ? 'You won ' + money(v[1]) + '!' : 'The coin didn’t land your way.';
        $('result-description').textContent = choice === 'take' ? 'A guaranteed payout. No coin flip needed.'
            : won ? 'The gamble paid off.' : 'The gamble paid $0 this time.';
    }
    function choosePlay(choice) {
        if (playBusy || !syncPlay()) return;
        const v = playValues();
        if (choice === 'take') {
            playOutcome = { choice, won: false, v };
            showOutcome();
            return;
        }
        playBusy = true;
        playOutcome = null;
        $('play-result').hidden = false;
        $('coin').classList.add('spinning');
        $('coin').textContent = '?';
        $('result-title').textContent = 'Flipping…';
        $('result-description').textContent = 'Will you win the jackpot?';
        $('play-share').disabled = true;
        $('play-again').disabled = true;
        for (const id of ['play-small', 'play-big', 'play-odds']) $(id).disabled = true;
        syncPlay();
        const random = window.crypto && crypto.getRandomValues
            ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
        setTimeout(() => {
            playOutcome = { choice, won: random < v[2] / 100, v };
            playBusy = false;
            for (const id of ['play-small', 'play-big', 'play-odds']) $(id).disabled = false;
            $('play-share').disabled = false;
            $('play-again').disabled = false;
            syncPlay();
            showOutcome();
        }, 950);
    }
    function shareResult() {
        if (!playOutcome) return;
        const { choice, won, v } = playOutcome;
        const url = new URL(location.pathname, location.origin);
        url.searchParams.set('small', v[0]);
        url.searchParams.set('big', v[1]);
        url.searchParams.set('odds', v[2]);
        url.searchParams.set('choice', choice);
        if (choice === 'flip') url.searchParams.set('result', won ? 'won' : 'lost');
        const summary = 'Would you take ' + money(v[0]) + ' or gamble for ' + money(v[1]) +
            ' at ' + percent(v[2]) + ' odds?\n' +
            (choice === 'take' ? 'I took the guaranteed ' + money(v[0]) + '.'
                : 'I flipped and ' + (won ? 'won ' + money(v[1]) + '!' : 'lost (got $0).'));
        $('share-text').value = summary + '\n\n' + url.href;
        $('copy-status').textContent = '';
        $('share-dialog').showModal();
    }
    function loadSharedPlay() {
        const params = new URLSearchParams(location.search);
        const shared = [Number(params.get('small')), Number(params.get('big')), Number(params.get('odds'))];
        if (!['small', 'big', 'odds'].every(k => params.has(k)) || !validValues(shared)) return;
        ['play-small', 'play-big', 'play-odds'].forEach((id, i) => { $(id).value = shared[i]; });
        syncPlay();
        const choice = params.get('choice'), result = params.get('result');
        if (choice === 'take' || (choice === 'flip' && (result === 'won' || result === 'lost'))) {
            playOutcome = { choice, won: result === 'won', v: shared };
            showOutcome();
        }
    }

    $('play-take').addEventListener('click', () => choosePlay('take'));
    $('play-flip').addEventListener('click', () => choosePlay('flip'));
    $('play-again').addEventListener('click', () => { playOutcome = null; showOutcome(); });
    $('play-share').addEventListener('click', shareResult);
    for (const id of ['play-small', 'play-big', 'play-odds']) $(id).addEventListener('input', () => {
        playOutcome = null; showOutcome(); syncPlay();
    });
    $('copy-share').addEventListener('click', async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText($('share-text').value);
            else { $('share-text').select(); document.execCommand('copy'); }
            $('copy-status').textContent = 'Copied to clipboard.';
        } catch (_) { $('copy-status').textContent = 'Select the text above to copy it.'; }
    });
    $('quiz-take').addEventListener('click', () => respond(false));
    $('quiz-flip').addEventListener('click', () => respond(true));
    $('undo-answer').addEventListener('click', () => {
        state.answers.pop(); saveAnswers(); refresh();
    });
    $('reset-answers').addEventListener('click', () => {
        if (!state.answers.length || !confirm('Clear all your breaking point answers?')) return;
        state.answers = []; saveAnswers(); refresh();
    });
    for (const btn of document.querySelectorAll('[data-mode]')) btn.addEventListener('click', () => {
        state.mode = Number(btn.dataset.mode);
        configureAxes();
    });
    $('axis-x').addEventListener('change', () => {
        state.x = axes.findIndex(a => a.key === $('axis-x').value);
        if (state.x === state.y) state.y = [0, 1, 2].find(i => i !== state.x);
        configureAxes();
    });
    $('axis-y').addEventListener('change', () => {
        state.y = axes.findIndex(a => a.key === $('axis-y').value);
        if (state.x === state.y) state.x = [0, 1, 2].find(i => i !== state.y);
        configureAxes();
    });
    canvas.addEventListener('pointerdown', e => {
        if (state.mode !== 3) return;
        state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
        $('plot-holder').classList.add('dragging');
    });
    canvas.addEventListener('pointermove', e => {
        if (!state.dragging) return;
        state.yaw += (e.clientX - state.lastX) * .009;
        state.pitch = clamp(state.pitch + (e.clientY - state.lastY) * .007, -.95, 1.25);
        state.lastX = e.clientX; state.lastY = e.clientY;
        scheduleDraw();
    });
    function stopDrag() { state.dragging = false; $('plot-holder').classList.remove('dragging'); }
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('wheel', e => {
        if (state.mode !== 3) return;
        e.preventDefault();
        state.zoom = clamp(state.zoom * Math.exp(-e.deltaY * .001), .55, 1.6);
        scheduleDraw();
    }, { passive: false });

    loadAnswers();
    loadSharedPlay();
    syncPlay();
    configureAxes();
    if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe($('plot-holder'));
    else window.addEventListener('resize', scheduleDraw);
})();