(() => {
    const pinballStartLevelToggleEl = document.getElementById('start-level-5-toggle');
    const pinballBaselineBestScore = isHardMode ? 10 : 11;
    const pinballTilesPerSecond = 7.5;
    const pinballOriginalGetBestScore = getBestScore;

    getBestScore = function getBestScoreWithBaseline() {
        return Math.max(pinballBaselineBestScore, pinballOriginalGetBestScore());
    };
    updateBestScoreDisplay();

    function pinballResetFromSelectedLevel() {
        clearTimersAndAnimation();
        closeResults();
        level = pinballStartLevelToggleEl && pinballStartLevelToggleEl.checked ? 5 : 1;
        solvedRounds = 0;
        updateCustomScoreDisplay();
        startRound();
    }

    if (pinballStartLevelToggleEl) {
        pinballStartLevelToggleEl.addEventListener('change', pinballResetFromSelectedLevel);
    }

    if (restartButtonEl) {
        restartButtonEl.addEventListener('click', (event) => {
            event.stopImmediatePropagation();
            pinballResetFromSelectedLevel();
        }, true);
    }

    animateTrajectory = function animateTrajectoryAtConstantTileSpeed() {
        const pinballCurrentAnimationToken = animationToken;
        const pinballBoardWidth = boardShellEl.clientWidth;
        const pinballBoardHeight = boardShellEl.clientHeight;
        const pinballTrajectoryPoints = getTrajectoryPoints();
        const pinballPathData = pointsToPath(pinballTrajectoryPoints);

        trajectoryLayerEl.setAttribute('viewBox', `0 0 ${pinballBoardWidth} ${pinballBoardHeight}`);
        trailMaskEl.setAttribute('x', '0');
        trailMaskEl.setAttribute('y', '0');
        trailMaskEl.setAttribute('width', String(pinballBoardWidth));
        trailMaskEl.setAttribute('height', String(pinballBoardHeight));
        trajectoryGuideEl.setAttribute('d', pinballPathData);
        trajectoryPathEl.setAttribute('d', pinballPathData);
        trailMaskPathEl.setAttribute('d', pinballPathData);

        const pinballTotalLength = Math.max(0.01, trajectoryGuideEl.getTotalLength());
        const pinballFirstPoint = trajectoryGuideEl.getPointAtLength(0);
        const pinballFirstCell = gridEl.querySelector('.pinball-cell');
        const pinballFirstCellRect = pinballFirstCell.getBoundingClientRect();
        const pinballTileSize = Math.max(1, (pinballFirstCellRect.width + pinballFirstCellRect.height) / 2);
        const pinballDistanceInTiles = pinballTotalLength / pinballTileSize;

        trailMaskPathEl.style.strokeDasharray = `0 ${pinballTotalLength}`;
        pinballDotEl.setAttribute('cx', pinballFirstPoint.x);
        pinballDotEl.setAttribute('cy', pinballFirstPoint.y);
        trajectoryPathEl.style.opacity = '1';
        pinballDotEl.style.opacity = '1';

        const pinballReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pinballDuration = pinballReducedMotion
            ? 200
            : Math.max(260, Math.round((pinballDistanceInTiles / pinballTilesPerSecond) * 1000));

        requestAnimationFrame((pinballStartTime) => {
            function pinballAnimationFrame(pinballNow) {
                if (pinballCurrentAnimationToken !== animationToken) {
                    return;
                }

                const pinballProgress = clamp((pinballNow - pinballStartTime) / pinballDuration, 0, 1);
                const pinballCurrentLength = Math.max(0.001, pinballTotalLength * pinballProgress);
                const pinballPoint = trajectoryGuideEl.getPointAtLength(pinballCurrentLength);

                trailMaskPathEl.style.strokeDasharray = `${pinballCurrentLength} ${pinballTotalLength}`;
                pinballDotEl.setAttribute('cx', pinballPoint.x);
                pinballDotEl.setAttribute('cy', pinballPoint.y);

                if (pinballProgress < 1) {
                    animationFrameId = requestAnimationFrame(pinballAnimationFrame);
                } else {
                    animationFrameId = null;
                    finishPrediction();
                }
            }

            animationFrameId = requestAnimationFrame(pinballAnimationFrame);
        });
    };
})();