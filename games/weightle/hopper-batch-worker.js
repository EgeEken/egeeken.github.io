'use strict';
importScripts('vendor/planck.min.js', 'sim.js', 'hopper.js');

onmessage = function ({ data }) {
    const { cfg, seed, weights } = data;
    const results = [];
    let index = 0;
    function next() {
        if (index === 5) {
            postMessage({ kind: 'complete', results });
            return;
        }
        try {
            const sim = self.WeightleSim.makeHopper(cfg, seed + ':stress:' + (index + 1), weights);
            while (!sim.done) sim.step();
            results.push({ distance: Math.round(sim.best * 100) / 100,
                score: cfg.milestones.filter(v => sim.best >= v).length });
            index++;
            postMessage({ kind: 'progress', current: index, total: 5, results });
            setTimeout(next, 0);
        } catch (error) {
            postMessage({ kind: 'error', message: String(error) });
        }
    }
    next();
};
