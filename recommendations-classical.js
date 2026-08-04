(() => {
    'use strict';

    const DATA_URL = 'data/recommendations-classical.json';
    const root = document.getElementById('recommendations');
    const embedToggle = document.getElementById('toggle-embeds');
    const embedLabel = document.querySelector('label[for="toggle-embeds"]');
    const header = document.querySelector('header');

    if (!root || !embedToggle || !embedLabel || !header) return;

    const subtitle = header.querySelector('h2');
    const normalSubtitle = subtitle?.textContent || '';
    const shuffleSubtitle = 'One randomly selected recommendation, press shuffle to get a new one';
    let recommendations = [];
    let allPieces = [];
    let currentShuffleIndex = -1;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);

    const fallbackSlug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const renderNote = note => {
        if (!note) return '';
        if (typeof note === 'string') {
            return `<p class="recommendation-note">${esc(note)}</p>`;
        }
        if (!Array.isArray(note.parts)) return '';

        const parts = note.parts.map(part => {
            const text = esc(part.text);
            if (!part.url) return text;
            return `<a href="${esc(part.url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }).join('');

        return `<p class="recommendation-note">${parts}</p>`;
    };

    const player = piece => `
        <div class="recommendation-player">
            <iframe
                data-src="https://www.youtube.com/embed/${esc(piece.video)}"
                title="${esc(piece.iframeTitle || piece.title)}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
            ></iframe>
        </div>`;

    function syncRecommendationPlayers(scope = document) {
        scope.querySelectorAll('.recommendation-player').forEach(container => {
            const iframe = container.querySelector('iframe');
            if (!iframe) return;

            let link = container.querySelector('.recommendation-link');
            if (!link) {
                const videoId = (iframe.dataset.src.split('/embed/')[1] || '').split(/[?&]/)[0];
                link = document.createElement('a');
                link.className = 'recommendation-link';
                link.href = 'https://www.youtube.com/watch?v=' + videoId;
                link.target = '_blank';
                link.rel = 'noopener';
                link.innerHTML = '<span class="recommendation-link-icon">►</span> Watch on YouTube';
                container.appendChild(link);
            }

            if (embedToggle.checked) {
                if (!iframe.src) iframe.src = iframe.dataset.src;
                iframe.style.display = '';
                link.style.display = 'none';
            } else {
                iframe.style.display = 'none';
                link.style.display = '';
            }
        });
    }

    function setupRecommendationMoreSections(scope = document) {
        scope.querySelectorAll('.recommendation-more').forEach(section => {
            if (section.dataset.recommendationReady === 'true') return;
            section.dataset.recommendationReady = 'true';

            const item = section.previousElementSibling;
            const toggle = section.querySelector('.recommendation-more-toggle');
            const content = section.querySelector('.recommendation-more-content');
            let hideTimer = null;
            if (!toggle || !content) return;

            const setHovering = () => {
                if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                }
                section.classList.add('hovering');
            };

            const scheduleHide = () => {
                if (section.classList.contains('expanded')) return;
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                    section.classList.remove('hovering');
                }, 3000);
            };

            if (item && item.classList.contains('recommendation-item')) {
                item.addEventListener('mouseenter', setHovering);
                item.addEventListener('mouseleave', scheduleHide);
            }

            section.addEventListener('mouseenter', setHovering);
            section.addEventListener('mouseleave', scheduleHide);

            toggle.addEventListener('click', () => {
                const isExpanded = section.classList.toggle('expanded');
                toggle.setAttribute('aria-expanded', String(isExpanded));
                content.setAttribute('aria-hidden', String(!isExpanded));
                toggle.textContent = isExpanded ? 'Hide more from this composer' : 'More from this composer';
                if (isExpanded) {
                    setHovering();
                } else {
                    scheduleHide();
                }
            });
        });
    }

    const renderNormal = () => {
        root.innerHTML = '';

        for (const group of recommendations) {
            root.insertAdjacentHTML(
                'beforeend',
                `<div class="recommendation-era"><h2>${esc(group.era)}</h2></div>`
            );

            for (const composer of group.composers) {
                const main = composer.main;
                root.insertAdjacentHTML(
                    'beforeend',
                    `<div class="recommendation-item">
                        <h2>${esc(composer.composer)}</h2>
                        <h3>${esc(main.title)}</h3>
                        ${renderNote(main.note)}
                        ${player(main)}
                    </div>`
                );

                if (composer.additional?.length) {
                    const additional = composer.additional.map(piece => `
                        <div class="recommendation-extra-item">
                            <h4>${esc(piece.title)}</h4>
                            ${renderNote(piece.note)}
                            ${player(piece)}
                        </div>
                    `).join('');

                    root.insertAdjacentHTML(
                        'beforeend',
                        `<div class="recommendation-more" data-composer="${esc(composer.slug || fallbackSlug(composer.composer))}">
                            <button class="recommendation-more-toggle" type="button" aria-expanded="false">More from this composer</button>
                            <div class="recommendation-more-content" aria-hidden="true">
                                <div class="recommendation-extra">${additional}</div>
                            </div>
                        </div>`
                    );
                }
            }
        }
    };

    const chooseShuffleIndex = () => {
        if (allPieces.length < 2) return 0;
        let next = currentShuffleIndex;
        while (next === currentShuffleIndex) {
            next = Math.floor(Math.random() * allPieces.length);
        }
        return next;
    };

    const renderShuffle = () => {
        currentShuffleIndex = chooseShuffleIndex();
        const piece = allPieces[currentShuffleIndex];
        root.innerHTML = `
            <div class="recommendation-item">
                <h2>${esc(piece.composer)}</h2>
                <h3>${esc(piece.title)}</h3>
                ${renderNote(piece.note)}
                ${player(piece)}
            </div>`;
        syncRecommendationPlayers(root);
    };

    const installControls = () => {
        const style = document.createElement('style');
        style.textContent = `
            .recommendation-controls {
                position: absolute;
                top: 20px;
                right: 20px;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
                z-index: 1000;
            }
            .recommendation-controls .start-level-toggle {
                position: static;
                justify-content: flex-start;
            }
            #shuffle-actions {
                display: none;
                width: 100%;
                justify-content: center;
                box-sizing: border-box;
                padding: 18px 20px 2px;
            }
            #shuffle-actions.visible {
                display: flex;
            }
            #shuffle-button {
                background-color: #b3262d;
                color: #fff;
                border: 3px solid #fff;
                border-radius: 8px;
                padding: 12px 28px;
                font-family: 'Futura', sans-serif;
                font-size: 1.05em;
                font-weight: bold;
                letter-spacing: 0.08em;
                cursor: pointer;
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
                transition: transform 0.2s, background-color 0.2s;
            }
            #shuffle-button:hover {
                background-color: #d33a42;
                transform: scale(1.05);
            }
            #shuffle-button:active {
                transform: scale(0.98);
            }
            body.shuffle-mode #recommendations {
                width: 100%;
            }
            body.shuffle-mode .recommendation-item {
                margin-top: 24px;
            }
            @media screen and (max-width: 700px) {
                .recommendation-controls {
                    top: 14px;
                    right: 14px;
                }
                .recommendation-controls .start-level-toggle {
                    padding: 8px 10px;
                    font-size: 0.8em;
                }
            }
        `;
        document.head.appendChild(style);

        const controls = document.createElement('div');
        controls.className = 'recommendation-controls';
        embedLabel.parentNode.insertBefore(controls, embedLabel);
        controls.appendChild(embedLabel);

        const shuffleLabel = document.createElement('label');
        shuffleLabel.className = 'start-level-toggle';
        shuffleLabel.htmlFor = 'toggle-shuffle';
        shuffleLabel.innerHTML = '<input type="checkbox" id="toggle-shuffle"><span>Shuffle mode</span>';
        controls.appendChild(shuffleLabel);

        const shuffleToggle = shuffleLabel.querySelector('input');
        const shuffleActions = document.createElement('div');
        shuffleActions.id = 'shuffle-actions';
        shuffleActions.innerHTML = '<button id="shuffle-button" type="button">SHUFFLE</button>';
        header.insertAdjacentElement('afterend', shuffleActions);
        const shuffleButton = shuffleActions.querySelector('button');

        const applyShuffleMode = () => {
            const enabled = shuffleToggle.checked;
            document.body.classList.toggle('shuffle-mode', enabled);
            shuffleActions.classList.toggle('visible', enabled);
            if (subtitle) subtitle.textContent = enabled ? shuffleSubtitle : normalSubtitle;

            if (enabled) {
                renderShuffle();
            } else {
                renderNormal();
                syncRecommendationPlayers(root);
                setupRecommendationMoreSections(root);
            }
        };

        shuffleToggle.addEventListener('change', applyShuffleMode);
        shuffleButton.addEventListener('click', renderShuffle);
    };

    async function init() {
        try {
            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const catalog = await response.json();
            recommendations = catalog.eras;
            allPieces = recommendations.flatMap(group => group.composers.flatMap(composer => [
                { ...composer.main, composer: composer.composer },
                ...(composer.additional || []).map(piece => ({ ...piece, composer: composer.composer }))
            ]));

            renderNormal();
            installControls();
            embedToggle.addEventListener('change', () => syncRecommendationPlayers());
            syncRecommendationPlayers();
            setupRecommendationMoreSections();
        } catch (error) {
            console.error('Failed to load classical recommendations:', error);
            root.innerHTML = '<p class="recommendation-note">The recommendations could not be loaded.</p>';
        }
    }

    init();
})();
