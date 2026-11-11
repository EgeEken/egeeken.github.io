'use strict';

importScripts('sim.js');

const { rngFrom, hashSeed, randomWeights, forward } = self.WeightleSim;

onmessage = function ({ data }) {
    const { seed, cfg, phase, previous } = data;
    const rng = rngFrom(hashSeed('train:' + seed + ':' + phase));
    const total = phase === 'basic' ? 70 : 420;
    const samples = Array.from({ length: 220 }, () => {
        const ballY = .10 + rng() * .80;
        const paddleY = .14 + rng() * .72;
        const vy = (rng() - .5) * 1.3;
        const incoming = rng() < .6 ? 1 : -1;
        const distance = rng() * .85 + .05;
        const gate = cfg.variant === 'Center gate' ? (cfg.gateY - paddleY) * 2 : 0;
        const observation = [
            Math.max(-1, Math.min(1, (ballY - paddleY) * 2)),
            distance * 2 - .4,
            incoming * (.55 + rng() * .45),
            vy, paddleY * 2 - 1,
            Math.max(-1, Math.min(1, gate))
        ];
        const flight = incoming > 0 ? Math.min(1.1, distance / (cfg.speed * 2)) : .22;
        let predicted = ballY + vy * flight * .31;
        if (predicted < 0) predicted = -predicted;
        if (predicted > 1) predicted = 2 - predicted;
        const target = Math.tanh((predicted - paddleY) * 5.5);
        return { observation, target };
    });
    let best = phase === 'basic' ? randomWeights('pong', seed + ':initial') : previous.slice();
    function loss(weights) {
        let sum = 0;
        for (const sample of samples) {
            const prediction = forward('pong', weights, sample.observation)[0];
            const delta = sample.target - prediction;
            sum += delta * delta;
        }
        return sum / samples.length + .0001 * weights.reduce((v, w) => v + w * w, 0);
    }
    let bestLoss = loss(best);
    let current = 0;
    const started = performance.now();
    function batch() {
        const limit = Math.min(total, current + 14);
        for (; current < limit; current++) {
            const candidate = best.slice();
            const changes = rng() < .25 ? 2 : 1;
            for (let j = 0; j < changes; j++) {
                const index = Math.floor(rng() * candidate.length);
                candidate[index] = Math.max(-6, Math.min(6,
                    candidate[index] + (rng() - rng()) * (phase === 'basic' ? 1.35 : .65)
                ));
            }
            const candidateLoss = loss(candidate);
            if (candidateLoss < bestLoss) {
                best = candidate;
                bestLoss = candidateLoss;
            }
        }
        postMessage({ kind: 'progress', phase, current, total, elapsed: Math.round(performance.now() - started) });
        if (current < total) setTimeout(batch, 0);
        else postMessage({
            kind: 'complete', phase, weights: best.map(v => Math.round(v * 10000) / 10000),
            loss: bestLoss, elapsed: Math.round(performance.now() - started)
        });
    }
    batch();
};
