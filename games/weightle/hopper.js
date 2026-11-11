(function (S, pl) {
    'use strict';

    const V = pl.Vec2;
    const DT = S.DT;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const smooth = t => {
        t = clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
    };

    S.makeHopper = function (cfg, seed, weights) {
        const rng = S.rngFrom(S.hashSeed('hopper-terrain-v2:' + seed));
        const world = new pl.World(V(0, cfg.gravity));
        const ground = world.createBody();
        const points = [];
        const STEP = .20;
        const END = 16.4;
        const barriers = [];
        const gaps = [];

        for (let x = 1.7, n = 0; x < 14.8; x += 1.45 + rng() * .85, n++) {
            const severity = clamp((x - 1.2) / 10, .30, 1);
            const height = (.12 + rng() * .25) * severity * cfg.roughness;
            barriers.push({
                x, w: .36 + rng() * .32, height: height * (rng() < .18 ? -.45 : 1)
            });
            if (cfg.terrain === 'Broken ground' && x > 3 && rng() < .36) {
                gaps.push({ from: x + .77, to: x + 1.03 + rng() * .12 });
            }
        }

        function height(x) {
            let y = 3.52;
            const noise = cfg.terrain === 'Rolling hills' ? .10 : .045;
            y += noise * (Math.sin(x * 2.1 + cfg.phase) - Math.sin(cfg.phase));
            y += noise * .45 * (Math.sin(x * 5.3 + cfg.phase * 2) - Math.sin(cfg.phase * 2));
            for (const item of barriers) {
                const d = Math.abs(x - item.x);
                const ramp = .22;
                if (d <= item.w) y -= item.height;
                else if (d < item.w + ramp) y -= item.height * smooth((item.w + ramp - d) / ramp);
            }
            return y;
        }

        function gapAt(x) {
            return gaps.some(g => x > g.from && x < g.to);
        }

        for (let i = 0; i <= Math.ceil((END + 2) / STEP); i++) {
            const x = -2 + i * STEP;
            points.push({ x, y: height(x) });
        }
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            if (gapAt((a.x + b.x) / 2)) continue;
            ground.createFixture(pl.Edge(V(a.x, a.y), V(b.x, b.y)), {
                friction: cfg.grip, restitution: 0
            });
        }

        const initialX = .55;
        const initialY = height(initialX) - 1.17;
        const torso = world.createDynamicBody({
            position: V(initialX, initialY),
            angularDamping: .9, linearDamping: .13, allowSleep: false
        });
        torso.createFixture(pl.Circle(.23), { density: cfg.mass * 3.5, friction: .4 });
        const upper = world.createDynamicBody({
            position: V(initialX, initialY + .31), angularDamping: .35, allowSleep: false
        });
        upper.createFixture(pl.Box(.058, .33), { density: .9, friction: .15 });
        const lower = world.createDynamicBody({
            position: V(initialX, initialY + .73), angularDamping: .35, allowSleep: false
        });
        lower.createFixture(pl.Box(.061, .28), { density: 1.0, friction: .3 });
        lower.createFixture(pl.Circle(V(0, .29), .13), {
            density: 1.7, friction: cfg.grip * 1.45, restitution: 0
        });

        const hip = world.createJoint(pl.RevoluteJoint({
            enableMotor: true, motorSpeed: 0, maxMotorTorque: cfg.torque
        }, torso, upper, V(initialX, initialY + .045)));
        const slider = world.createJoint(pl.PrismaticJoint({
            enableMotor: true, motorSpeed: 0, maxMotorForce: cfg.springForce,
            enableLimit: true, lowerTranslation: -.26, upperTranslation: .25
        }, upper, lower, V(initialX, initialY + .53), V(0, 1)));

        const s = {
            type: 'hopper', cfg, seed, weights, world, torso, upper, lower, hip, slider,
            frame: 0, done: false, win: false, best: initialX,
            footContact: false, unstableFrames: 0,
            groundAt: height, course: points, barriers, gaps,
            milestones: cfg.milestones.slice(), rayVisuals: []
        };

        function ray(a, b) {
            let fraction = 1;
            world.rayCast(a, b, (fixture, point, normal, f) => {
                if (fixture.getBody() !== ground) return -1;
                fraction = Math.min(fraction, f);
                return f;
            });
            s.rayVisuals.push([a, b, fraction]);
            return fraction * 2 - 1;
        }

        s.getSensors = function () {
            const pos = torso.getPosition(), vel = torso.getLinearVelocity();
            const angle = Math.atan2(Math.sin(torso.getAngle()), Math.cos(torso.getAngle()));
            const jointAngle = hip.getJointAngle();
            const legExtension = slider.getJointTranslation();
            s.rayVisuals = [];
            const ahead = ray(V(pos.x + .10, pos.y + .28), V(pos.x + 1.65, pos.y + 1.15));
            const below = ray(V(pos.x + .32, pos.y + .08), V(pos.x + .32, pos.y + 1.60));
            return [
                clamp(angle / 1.7, -1, 1),
                clamp(torso.getAngularVelocity() / 6, -1, 1),
                clamp(vel.x / 2.8, -1, 1),
                Math.sin(jointAngle),
                Math.cos(jointAngle),
                clamp(legExtension / .26, -1, 1),
                s.footContact ? 1 : -1,
                ahead, below
            ];
        };

        s.getActions = () => S.forward('hopper', weights, s.getSensors());

        s.step = function () {
            if (s.done) return;
            const actions = s.getActions();
            hip.setMotorSpeed(actions[0] * cfg.motorSpeed * cfg.direction);
            slider.setMotorSpeed(actions[1] * cfg.extensionSpeed);
            world.step(DT, 7, 3);
            s.frame++;

            s.footContact = false;
            for (let c = world.getContactList(); c; c = c.getNext()) {
                if (!c.isTouching()) continue;
                const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
                if ((a === lower && b === ground) || (a === ground && b === lower)) {
                    s.footContact = true;
                    break;
                }
            }

            const p = torso.getPosition();
            s.best = Math.max(s.best, p.x);
            const angle = Math.abs(Math.atan2(Math.sin(torso.getAngle()), Math.cos(torso.getAngle())));
            const fallen = angle > 2.45 || p.y > height(p.x) - .13;
            s.unstableFrames = fallen ? s.unstableFrames + 1 : Math.max(0, s.unstableFrames - 2);
            if (s.best >= cfg.milestones[2]) {
                s.done = true;
                s.win = true;
            } else if (s.frame >= cfg.maxFrames || p.y > 6 || p.x < -1.2 ||
                s.unstableFrames >= 50) {
                s.done = true;
            }
        };

        s.draw = function (ctx) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            ctx.fillStyle = '#0d1c29';
            ctx.fillRect(0, 0, w, h);
            const scale = h / 4.05;
            const origin = Math.max(-.7, torso.getPosition().x - 1.15);
            const sx = x => (x - origin) * scale;
            const sy = y => (y - .18) * scale;

            ctx.fillStyle = '#29434a';
            ctx.beginPath();
            ctx.moveTo(sx(points[0].x), h + 20);
            for (const point of points) ctx.lineTo(sx(point.x), sy(point.y));
            ctx.lineTo(sx(points[points.length - 1].x), h + 20);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#84af9d';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            let drawing = false;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i], b = points[i + 1];
                if (gapAt((a.x + b.x) / 2)) {
                    drawing = false;
                    continue;
                }
                if (!drawing) { ctx.moveTo(sx(a.x), sy(a.y)); drawing = true; }
                ctx.lineTo(sx(b.x), sy(b.y));
            }
            ctx.stroke();

            ctx.fillStyle = '#0d1c29';
            for (const gap of gaps) {
                ctx.fillRect(sx(gap.from), sy(height(gap.from)) + 2,
                    Math.max(0, sx(gap.to) - sx(gap.from)), h);
            }

            for (let i = 0; i < cfg.milestones.length; i++) {
                const x = sx(cfg.milestones[i]);
                if (x < -15 || x > w + 15) continue;
                const y = sy(height(cfg.milestones[i]));
                const reached = s.best >= cfg.milestones[i];
                ctx.strokeStyle = reached ? '#54cfaa' : '#ddba77';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, y - 59); ctx.lineTo(x, y); ctx.stroke();
                ctx.fillStyle = reached ? '#236f62' : '#765b37';
                ctx.beginPath(); ctx.arc(x, y - 64, 12, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(String(i + 1), x, y - 59);
            }

            for (let i = 0; i < s.rayVisuals.length; i++) {
                const [a, b, f] = s.rayVisuals[i];
                ctx.strokeStyle = i === 0 ? '#d2b56d99' : '#69bada99';
                ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y));
                ctx.lineTo(sx(a.x + (b.x - a.x) * f), sy(a.y + (b.y - a.y) * f));
                ctx.stroke(); ctx.setLineDash([]);
            }

            function drawBody(body, shape, fill) {
                const p = body.getPosition();
                ctx.save();
                ctx.translate(sx(p.x), sy(p.y));
                ctx.rotate(body.getAngle());
                ctx.fillStyle = fill;
                if (shape === 'torso') {
                    ctx.beginPath(); ctx.arc(0, 0, .23 * scale, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#102f34';
                    ctx.fillRect(.045 * scale, -.08 * scale, .085 * scale, .075 * scale);
                } else {
                    const wide = shape === 'upper' ? .06 : .064;
                    const half = shape === 'upper' ? .33 : .28;
                    ctx.fillRect(-wide * scale, -half * scale, wide * 2 * scale, half * 2 * scale);
                    if (shape === 'lower') {
                        ctx.beginPath(); ctx.arc(0, .29 * scale, .13 * scale, 0, Math.PI * 2);
                        ctx.fillStyle = s.footContact ? '#f2c679' : '#b78e63';
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
            drawBody(upper, 'upper', '#dcba7e');
            drawBody(lower, 'lower', '#bd9d73');
            drawBody(torso, 'torso', '#67d4bf');

            ctx.fillStyle = '#e5f3f8';
            ctx.textAlign = 'left'; ctx.font = 'bold 16px system-ui';
            ctx.fillText(Math.max(0, s.best - .55).toFixed(2) + ' m', 13, 25);
            ctx.fillStyle = '#a4c4ca'; ctx.font = '12px system-ui';
            ctx.fillText((s.frame * DT).toFixed(1) + ' / ' + (cfg.maxFrames * DT).toFixed(0) + ' s', 13, 43);
        };
        return s;
    };
})(window.WeightleSim, window.planck);
