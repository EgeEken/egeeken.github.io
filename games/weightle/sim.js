(function (root) {
    'use strict';

    const DT = 1 / 60;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const smooth = x => x * x * (3 - 2 * x);
    const specs = {
        pong: {
            title: 'Pong', category: 'Adversarial',
            inputs: [
                ['Ball ΔY', 'Vertical distance from the paddle to the ball'],
                ['Ball distance', 'Horizontal distance to the ball'],
                ['Incoming speed', 'Positive when the ball approaches your paddle'],
                ['Ball vertical speed', 'Positive when the ball travels down'],
                ['Paddle height', 'Your vertical position relative to the center'],
                ['Gate ΔY', 'Vertical offset to the opening in the center wall']
            ],
            outputs: ['Paddle motor']
        },
        walker: {
            title: 'Rotor Walker', category: 'Endurance',
            inputs: [
                ['Ground ahead', 'Ground slope detected by a forward ray'],
                ['Ground below', 'Distance from the body to the ground'],
                ['Forward speed', 'Current horizontal speed'],
                ['Foot contact', 'Whether the rotating foot is touching terrain'],
                ['Leg angle', 'Sine of the leg angle'],
                ['Clock sine', 'Internal periodic clock'],
                ['Clock cosine', 'Internal periodic clock shifted by 90°']
            ],
            outputs: ['Leg motor', 'Spring motor']
        },
        lander: {
            title: 'Lander', category: 'Task',
            inputs: [
                ['Target ΔX', 'Target position relative to the craft'],
                ['Altitude', 'Height above the landing platform'],
                ['Horizontal speed', 'Positive when moving right'],
                ['Descent speed', 'Positive when descending'],
                ['Wind', 'Wind acceleration acting on the craft'],
                ['Horizontal position', 'Craft position relative to the center']
            ],
            outputs: ['Horizontal thrust', 'Vertical thrust']
        }
    };

    function hashSeed(value) {
        let h = 2166136261;
        for (const char of String(value)) {
            h ^= char.codePointAt(0);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function rngFrom(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6d2b79f5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randomWeights(type, seed) {
        const rng = rngFrom(hashSeed(seed));
        const n = (specs[type].inputs.length + 1) * specs[type].outputs.length;
        return Array.from({ length: n }, () => Math.round((rng() * 3 - 1.5) * 10) / 10);
    }

    function configFor(type, seed) {
        const rng = rngFrom(hashSeed(type + ':' + seed));
        if (type === 'pong') {
            const variants = ['Standard', 'Inverted bounce', 'Center gate', 'Paddle pulse', 'Sidewind'];
            return {
                type, variant: variants[Math.floor(rng() * variants.length)],
                gateY: .30 + rng() * .40,
                gateHalf: .115 + rng() * .045,
                speed: .46 + rng() * .10,
                paddleSpeed: .90 + rng() * .17,
                paddleHalf: .135 + rng() * .020,
                wind: (rng() - .5) * .36
            };
        }
        if (type === 'walker') {
            const variants = ['Spinning leg', 'Elastic leg', 'Reverse joint', 'Rough ground'];
            return {
                type, variant: variants[Math.floor(rng() * variants.length)],
                roughness: .65 + rng() * .6,
                grip: .75 + rng() * .5,
                phase: rng() * Math.PI * 2,
                bumps: Array.from({ length: 18 }, (_, i) => ({
                    x: 1.1 + i * .72 + rng() * .38,
                    h: (.045 + rng() * .10) * (i < 3 ? .5 : 1),
                    w: .32 + rng() * .22
                })),
                milestones: [2, 5, 9]
            };
        }
        if (type === 'lander') {
            const variants = ['Crosswind', 'Low gravity', 'Heavy craft', 'Moving pad'];
            return {
                type, variant: variants[Math.floor(rng() * variants.length)],
                padX: .33 + rng() * .34,
                wind: (rng() < .5 ? -1 : 1) * (.012 + rng() * .018),
                gravity: .25 + rng() * .035,
                thrust: .53 + rng() * .06,
                milestones: [1, 2, 3]
            };
        }
        throw Error('Unknown game type');
    }

    function forward(type, weights, inputs) {
        const n = specs[type].inputs.length;
        return specs[type].outputs.map((_, o) => {
            const start = o * (n + 1);
            let z = weights[start + n] || 0;
            for (let i = 0; i < n; i++) z += (weights[start + i] || 0) * inputs[i];
            return Math.tanh(z);
        });
    }

    function makePong(cfg, seed, player, opponent) {
        const rng = rngFrom(hashSeed('match:' + seed));
        const s = {
            type: 'pong', cfg, player, opponent, done: false, win: false,
            frame: 0, rally: 0, score: [0, 0], y: [.5, .5],
            ball: { x: .5, y: .5, vx: cfg.speed, vy: 0 },
            errors: [0, 0], samples: [0, 0], lastSensors: null, lastActions: [0, 0]
        };

        function half(side) {
            return cfg.paddleHalf * (cfg.variant === 'Paddle pulse'
                ? (.70 + .30 * (1 + Math.sin(s.frame * .065 + side * 1.7)) / 2) : 1);
        }

        function serve() {
            s.rally = 0;
            s.errors = [0, 0];
            s.samples = [0, 0];
            s.ball.x = .5;
            s.ball.y = .20 + rng() * .60;
            s.ball.vx = cfg.speed * (rng() < .5 ? 1 : -1);
            s.ball.vy = (rng() - .5) * .42;
        }

        function sensors(side) {
            const px = side === 0 ? .07 : .93;
            const toward = side === 0 ? -s.ball.vx : s.ball.vx;
            return [
                clamp((s.ball.y - s.y[side]) * 2, -1, 1),
                clamp(Math.abs(s.ball.x - px) * 2 - .4, -1, 1),
                clamp(toward / .7, -1, 1),
                clamp(s.ball.vy / .6, -1, 1),
                s.y[side] * 2 - 1,
                cfg.variant === 'Center gate' ? clamp((cfg.gateY - s.y[side]) * 2, -1, 1) : 0
            ];
        }

        function point(side) {
            s.score[side]++;
            if (s.score[side] >= 3 || s.frame >= 3500) {
                s.done = true;
                s.win = s.score[0] > s.score[1];
            } else {
                serve();
            }
        }

        serve();
        s.getSensors = () => sensors(0);
        s.getActions = () => forward('pong', player, sensors(0));
        s.step = function () {
            if (s.done) return;
            s.frame++;
            s.rally++;
            for (let side = 0; side < 2; side++) {
                const input = sensors(side);
                const act = forward('pong', side === 0 ? player : opponent, input)[0];
                if (side === 0) { s.lastSensors = input; s.lastActions[0] = act; }
                else s.lastActions[1] = act;
                s.y[side] = clamp(s.y[side] + act * cfg.paddleSpeed * DT, half(side), 1 - half(side));
                const toward = side === 0 ? s.ball.vx < 0 : s.ball.vx > 0;
                if (toward) {
                    s.errors[side] += Math.abs(s.ball.y - s.y[side]);
                    s.samples[side]++;
                }
            }

            const b = s.ball;
            const oldX = b.x;
            b.x += b.vx * DT;
            b.y += b.vy * DT;
            if (cfg.variant === 'Sidewind') b.vy = clamp(b.vy + cfg.wind * DT * .12, -.85, .85);
            if (b.y < .018) { b.y = .036 - b.y; b.vy = Math.abs(b.vy); }
            if (b.y > .982) { b.y = 1.964 - b.y; b.vy = -Math.abs(b.vy); }

            if (cfg.variant === 'Center gate' && (oldX - .5) * (b.x - .5) <= 0 && Math.abs(b.y - cfg.gateY) > cfg.gateHalf) {
                b.x = oldX;
                b.vx *= -1;
                b.vy = clamp(b.vy + (cfg.gateY - b.y) * .14, -.85, .85);
            }

            for (let side = 0; side < 2; side++) {
                const face = side === 0 ? .085 : .915;
                if ((side === 0 && b.vx < 0 && b.x <= face && oldX > face) ||
                    (side === 1 && b.vx > 0 && b.x >= face && oldX < face)) {
                    const offset = (b.y - s.y[side]) / half(side);
                    if (Math.abs(offset) <= 1.15) {
                        b.x = face + (side === 0 ? .002 : -.002);
                        b.vx = (side === 0 ? 1 : -1) * Math.min(.96, Math.abs(b.vx) * 1.055);
                        const flip = cfg.variant === 'Inverted bounce' ? -1 : 1;
                        b.vy = clamp(offset * .48 * flip + b.vy * .30, -.72, .72);
                    }
                }
            }
            if (b.x < -.025) point(1);
            else if (b.x > 1.025) point(0);
            else if (s.rally >= 900) {
                const error0 = s.errors[0] / (s.samples[0] || 1);
                const error1 = s.errors[1] / (s.samples[1] || 1);
                point(error0 <= error1 ? 0 : 1);
            }
        };
        s.draw = function (ctx) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            ctx.fillStyle = '#0c1722'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#30465a'; ctx.setLineDash([5, 8]);
            ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
            if (cfg.variant === 'Center gate') {
                ctx.fillStyle = '#68859c';
                const top = (cfg.gateY - cfg.gateHalf) * h;
                const bottom = (cfg.gateY + cfg.gateHalf) * h;
                ctx.fillRect(w / 2 - 5, 0, 10, top);
                ctx.fillRect(w / 2 - 5, bottom, 10, h - bottom);
            }
            for (let side = 0; side < 2; side++) {
                ctx.fillStyle = side === 0 ? '#60d7c2' : '#e6b47b';
                ctx.fillRect((side === 0 ? .064 : .928) * w, (s.y[side] - half(side)) * h, w * .012, half(side) * 2 * h);
            }
            ctx.fillStyle = '#f3f7ff';
            ctx.beginPath(); ctx.arc(s.ball.x * w, s.ball.y * h, 5, 0, Math.PI * 2); ctx.fill();
            ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
            ctx.fillStyle = '#8dd8cb'; ctx.fillText(s.score[0], w * .35, 29);
            ctx.fillStyle = '#efc49a'; ctx.fillText(s.score[1], w * .65, 29);
        };
        return s;
    }

    function makeWalker(cfg, seed, weights) {
        const rng = rngFrom(hashSeed('walk:' + seed));
        const s = {
            type: 'walker', cfg, weights, done: false, win: false,
            frame: 0, x: .05, y: 1.95, vx: 0, vy: 0, theta: .4 + rng() * .2,
            omega: 0, length: .43, legRate: 0, contact: false,
            groundedFrames: 0, best: 0
        };
        const sign = cfg.variant === 'Reverse joint' ? -1 : 1;
        function groundAt(x) {
            let h = 2.48 - .02 * Math.sin(x * 2.3);
            for (const bump of cfg.bumps) {
                const d = (x - bump.x) / bump.w;
                if (Math.abs(d) < 1) h -= bump.h * cfg.roughness * smooth(1 - Math.abs(d));
            }
            return h;
        }
        s.groundAt = groundAt;
        s.getSensors = () => [
            clamp((groundAt(s.x + .50) - groundAt(s.x)) * -3, -1, 1),
            clamp((groundAt(s.x) - s.y - .2) * 2, -1, 1),
            clamp(s.vx / 3, -1, 1),
            s.contact ? 1 : -1,
            Math.sin(s.theta),
            Math.sin(s.frame * DT * 6 + cfg.phase),
            Math.cos(s.frame * DT * 6 + cfg.phase)
        ];
        s.getActions = () => forward('walker', weights, s.getSensors());
        s.step = function () {
            if (s.done) return;
            s.frame++;
            const a = s.getActions();
            const targetOmega = a[0] * 8 * sign;
            s.omega += (targetOmega - s.omega) * .18;
            s.theta += s.omega * DT;
            const extensionSpeed = a[1] * (cfg.variant === 'Elastic leg' ? .85 : .48);
            s.legRate = extensionSpeed;
            s.length = clamp(s.length + extensionSpeed * DT, .27, .68);
            const footX = s.x + Math.sin(s.theta) * s.length;
            const footY = s.y + Math.cos(s.theta) * s.length;
            const penetration = footY - groundAt(footX);
            s.contact = penetration > 0;
            let fx = 0, fy = 7.5;
            if (s.contact) {
                const footVy = s.vy - Math.sin(s.theta) * s.omega * s.length + Math.cos(s.theta) * s.legRate;
                const normal = clamp(penetration * 125 + footVy * 13, 0, 55);
                const footVx = s.vx + Math.cos(s.theta) * s.omega * s.length + Math.sin(s.theta) * s.legRate;
                const grip = cfg.grip * (cfg.variant === 'Rough ground' ? .72 : 1);
                fx = clamp(-footVx * 18, -normal * grip, normal * grip);
                fy -= normal;
            }
            s.vx = clamp((s.vx + fx * DT) * .998, -5, 5);
            s.vy = clamp((s.vy + fy * DT) * .997, -7, 7);
            s.x += s.vx * DT;
            s.y += s.vy * DT;
            const ground = groundAt(s.x);
            if (s.y + .19 > ground) {
                s.y = ground - .19;
                s.vy = Math.min(0, s.vy);
                s.vx *= .90;
                s.groundedFrames++;
            } else {
                s.groundedFrames = 0;
            }
            s.best = Math.max(s.best, s.x);
            if (s.best >= cfg.milestones[2]) { s.done = true; s.win = true; }
            if (s.x < -1.2 || s.frame >= 1800 || s.groundedFrames > 240) s.done = true;
        };
        s.draw = function (ctx) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            ctx.fillStyle = '#10202b'; ctx.fillRect(0, 0, w, h);
            const scale = h / 3.2;
            const camera = Math.max(-1.1, s.x - 1.25);
            const sx = x => (x - camera) * scale;
            const sy = y => (y - .35) * scale;
            ctx.fillStyle = '#283e45';
            ctx.beginPath(); ctx.moveTo(0, h);
            for (let i = 0; i <= w + 10; i += 6) {
                const x = camera + i / scale;
                ctx.lineTo(i, sy(groundAt(x)));
            }
            ctx.lineTo(w, h); ctx.fill();
            ctx.strokeStyle = '#7d9b87'; ctx.lineWidth = 3; ctx.beginPath();
            for (let i = 0; i <= w; i += 5) {
                const y = sy(groundAt(camera + i / scale));
                if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
            }
            ctx.stroke();
            for (let i = 0; i < cfg.milestones.length; i++) {
                const x = sx(cfg.milestones[i]);
                if (x < -10 || x > w + 10) continue;
                ctx.strokeStyle = i === 2 ? '#65d5bd' : '#d6b379';
                ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, sy(groundAt(cfg.milestones[i])) - 52);
                ctx.lineTo(x, sy(groundAt(cfg.milestones[i]))); ctx.stroke();
                ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(String(i + 1), x, sy(groundAt(cfg.milestones[i])) - 57);
            }
            const bx = sx(s.x), by = sy(s.y);
            const fx = sx(s.x + Math.sin(s.theta) * s.length);
            const fy = sy(s.y + Math.cos(s.theta) * s.length);
            ctx.strokeStyle = '#d7a66f'; ctx.lineWidth = 9; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.fillStyle = s.contact ? '#f5cd83' : '#ac835a';
            ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#68d4bd';
            ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#14313a'; ctx.beginPath(); ctx.arc(bx + 4, by - 3, 3, 0, Math.PI * 2); ctx.fill();
            ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#eff8fc';
            ctx.fillText(s.best.toFixed(1) + ' m', 14, 25);
        };
        return s;
    }

    function makeLander(cfg, seed, weights, level) {
        const rng = rngFrom(hashSeed('land:' + seed + ':' + level));
        const direction = rng() < .5 ? -1 : 1;
        const offset = [.10, .22, .30][level] * direction;
        const s = {
            type: 'lander', cfg, weights, level, done: false, win: false,
            frame: 0, x: clamp(cfg.padX + offset, .12, .88), y: .13,
            vx: (rng() - .5) * (.015 + level * .032), vy: .01,
            padHalf: [.145, .115, .09][level], padX: cfg.padX,
            burn: 0, sideways: 0
        };
        s.getSensors = () => [
            clamp((s.padX - s.x) * 2.5, -1, 1),
            clamp((.87 - s.y) * 1.2, -1, 1),
            clamp(s.vx * 4, -1, 1),
            clamp(s.vy * 4, -1, 1),
            clamp(cfg.wind * 22, -1, 1),
            s.x * 2 - 1
        ];
        s.getActions = () => forward('lander', weights, s.getSensors());
        s.step = function () {
            if (s.done) return;
            s.frame++;
            const a = s.getActions();
            s.sideways = a[0];
            s.burn = (a[1] + 1) / 2;
            const gust = cfg.wind * (1 + level * .3) * (cfg.variant === 'Crosswind' ? 1.6 : 1);
            const gravity = cfg.gravity * (cfg.variant === 'Low gravity' ? .75 : cfg.variant === 'Heavy craft' ? 1.2 : 1);
            s.vx = clamp(s.vx + (a[0] * .34 + gust) * DT, -.6, .6);
            s.vy = clamp(s.vy + (gravity - s.burn * cfg.thrust) * DT, -.6, .6);
            s.x += s.vx * DT;
            s.y += s.vy * DT;
            if (s.x < .035 || s.x > .965 || s.y < .025) {
                s.done = true;
                return;
            }
            if (s.y >= .87) {
                s.win = Math.abs(s.x - s.padX) <= s.padHalf &&
                    Math.abs(s.vx) <= .17 - level * .025 &&
                    Math.abs(s.vy) <= .18 - level * .02;
                s.done = true;
            }
            if (s.frame >= 1200) s.done = true;
        };
        s.draw = function (ctx) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            ctx.fillStyle = '#0c1826'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#22354b'; ctx.fillRect(0, h * .87 + 7, w, h * .13);
            const px = s.padX * w, py = h * .87;
            ctx.fillStyle = '#6adbbd'; ctx.fillRect(px - s.padHalf * w, py, s.padHalf * 2 * w, 7);
            ctx.fillStyle = '#54746f'; ctx.fillRect(px - 2, py - 42, 4, 42);
            const x = s.x * w, y = s.y * h;
            ctx.save(); ctx.translate(x, y); ctx.rotate(-s.sideways * .21);
            ctx.fillStyle = '#d8e9ef'; ctx.beginPath(); ctx.moveTo(0, -14);
            ctx.lineTo(-11, 10); ctx.lineTo(11, 10); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#4a95ae'; ctx.fillRect(-5, -3, 10, 9);
            if (!s.done && s.burn > .04) {
                ctx.fillStyle = '#eeb56b'; ctx.beginPath(); ctx.moveTo(-6, 12);
                ctx.lineTo(0, 12 + 23 * s.burn); ctx.lineTo(6, 12); ctx.fill();
            }
            ctx.restore();
            ctx.strokeStyle = '#446b85'; ctx.setLineDash([3, 7]); ctx.beginPath();
            ctx.moveTo(px, 0); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#dde8f3'; ctx.font = '13px system-ui'; ctx.textAlign = 'left';
            ctx.fillText('vx ' + s.vx.toFixed(2) + '  vy ' + s.vy.toFixed(2), 12, 21);
            ctx.fillText('Level ' + (s.level + 1), 12, 40);
        };
        return s;
    }

    root.WeightleSim = { DT, specs, hashSeed, rngFrom, randomWeights, configFor, forward, makePong, makeWalker, makeLander };
})(typeof self === 'undefined' ? globalThis : self);
