(() => {
    'use strict';

    const CONFIG = {
        dataUrl: 'data/recommendations-classical.json',
        groupsField: 'eras',
        groupTitleField: 'era',
        membersField: 'composers',
        memberNameField: 'composer',
        moreNoun: 'composer',
        errorLabel: 'classical'
    };

    const root = document.getElementById('recommendations');
    const embedToggle = document.getElementById('toggle-embeds');
    const embedLabel = document.querySelector('label[for="toggle-embeds"]');
    const header = document.querySelector('header');

    if (!root || !embedToggle || !embedLabel || !header) return;

    const subtitle = header.querySelector('h2');
    const normalSubtitle = subtitle?.textContent || '';
    const shuffleSubtitle = 'One randomly selected recommendation, press shuffle to get a new one';
    const entryEmbedOverrides = new Map();
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
            return '<p class="recommendation-note">' + esc(note) + '</p>';
        }
        if (!Array.isArray(note.parts)) return '';

        const parts = note.parts.map(part => {
            const text = esc(part.text);
            if (!part.url) return text;
            return '<a href="' + esc(part.url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        }).join('');

        return '<p class="recommendation-note">' + parts + '</p>';
    };

    const eyeIcon = open => open
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.7"></circle></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.4 17.4 0 0 1-3 3.6"></path><path d="M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8"></path></svg>';

    const entryEmbedButton = piece =>
        '<button class="recommendation-entry-embed" type="button" data-video="' + esc(piece.video) + '" aria-label="Toggle embed for this entry"></button>';

    const player = piece =>
        '<div class="recommendation-player" data-video="' + esc(piece.video) + '">' +
            '<iframe data-src="https://www.youtube.com/embed/' + esc(piece.video) + '"' +
                ' title="' + esc(piece.iframeTitle || piece.title) + '"' +
                ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
                ' allowfullscreen></iframe>' +
        '</div>';

    const effectiveEmbedState = videoId =>
        entryEmbedOverrides.has(videoId) ? entryEmbedOverrides.get(videoId) : embedToggle.checked;

    function syncRecommendationPlayers(scope = document) {
        scope.querySelectorAll('.recommendation-player').forEach(container => {
            const iframe = container.querySelector('iframe');
            if (!iframe) return;

            const videoId = container.dataset.video || (iframe.dataset.src.split('/embed/')[1] || '').split(/[?&]/)[0];
            let link = container.querySelector('.recommendation-link');
            if (!link) {
                link = document.createElement('a');
                link.className = 'recommendation-link';
                link.href = 'https://www.youtube.com/watch?v=' + videoId;
                link.target = '_blank';
                link.rel = 'noopener';
                link.innerHTML = '<span class="recommendation-link-icon">►</span> Watch on YouTube';
                container.appendChild(link);
            }

            const more = container.closest('.recommendation-more');
            const groupContent = container.closest('.recommendation-group-content');
            const hiddenByMore = more && !more.classList.contains('expanded');
            const hiddenByGroup = groupContent?.classList.contains('collapsed');
            const enabled = effectiveEmbedState(videoId) && !hiddenByMore && !hiddenByGroup;

            if (enabled) {
                if (!iframe.getAttribute('src')) iframe.src = iframe.dataset.src;
                iframe.style.display = '';
                link.style.display = 'none';
            } else {
                iframe.removeAttribute('src');
                iframe.style.display = 'none';
                link.style.display = '';
            }

            const item = container.closest('.recommendation-item, .recommendation-extra-item');
            const button = item?.querySelector('.recommendation-entry-embed');
            if (button) {
                button.innerHTML = eyeIcon(enabled);
                button.setAttribute('aria-pressed', String(enabled));
                button.setAttribute('aria-label', enabled ? 'Hide embed for this entry' : 'Show embed for this entry');
                button.title = enabled ? 'Hide embed for this entry' : 'Show embed for this entry';
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
                hideTimer = setTimeout(() => section.classList.remove('hovering'), 3000);
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
                toggle.textContent = isExpanded ? 'Hide more from this ' + CONFIG.moreNoun : 'More from this ' + CONFIG.moreNoun;
                syncRecommendationPlayers(content);
                if (isExpanded) setHovering();
                else scheduleHide();
            });
        });
    }

    function setupGroupSections(scope = document) {
        scope.querySelectorAll('.recommendation-group-toggle').forEach(toggle => {
            if (toggle.dataset.groupReady === 'true') return;
            toggle.dataset.groupReady = 'true';

            const content = toggle.nextElementSibling;
            if (!content?.classList.contains('recommendation-group-content')) return;

            const setExpanded = expanded => {
                toggle.setAttribute('aria-expanded', String(expanded));
                content.classList.toggle('collapsed', !expanded);
                content.setAttribute('aria-hidden', String(!expanded));
                syncRecommendationPlayers(content);
            };

            const activate = () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
            toggle.addEventListener('click', activate);
            toggle.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate();
            });
        });
    }

    const renderMember = member => {
        const name = member[CONFIG.memberNameField];
        const main = member.main;
        let html =
            '<div class="recommendation-item">' +
                entryEmbedButton(main) +
                '<h2>' + esc(name) + '</h2>' +
                '<h3>' + esc(main.title) + '</h3>' +
                renderNote(main.note) +
                player(main) +
            '</div>';

        if (member.additional?.length) {
            const additional = member.additional.map(piece =>
                '<div class="recommendation-extra-item">' +
                    entryEmbedButton(piece) +
                    '<h4>' + esc(piece.title) + '</h4>' +
                    renderNote(piece.note) +
                    player(piece) +
                '</div>'
            ).join('');

            html +=
                '<div class="recommendation-more" data-owner="' + esc(member.slug || fallbackSlug(name)) + '">' +
                    '<button class="recommendation-more-toggle" type="button" aria-expanded="false">More from this ' + CONFIG.moreNoun + '</button>' +
                    '<div class="recommendation-more-content" aria-hidden="true">' +
                        '<div class="recommendation-extra">' + additional + '</div>' +
                    '</div>' +
                '</div>';
        }

        return html;
    };

    const renderNormal = () => {
        root.innerHTML = '';

        for (const group of recommendations) {
            const title = group[CONFIG.groupTitleField];
            const members = group[CONFIG.membersField] || [];
            const content = members.map(renderMember).join('');

            root.insertAdjacentHTML(
                'beforeend',
                '<div class="recommendation-era recommendation-group-toggle" role="button" tabindex="0" aria-expanded="true">' +
                    '<h2>' + esc(title) + '</h2>' +
                '</div>' +
                '<div class="recommendation-group-content" aria-hidden="false">' +
                    '<div class="recommendation-group-inner">' + content + '</div>' +
                '</div>'
            );
        }

        syncRecommendationPlayers(root);
        setupRecommendationMoreSections(root);
        setupGroupSections(root);
    };

    const chooseShuffleIndex = () => {
        if (allPieces.length < 2) return 0;
        let next = currentShuffleIndex;
        while (next === currentShuffleIndex) next = Math.floor(Math.random() * allPieces.length);
        return next;
    };

    const renderShuffle = () => {
        currentShuffleIndex = chooseShuffleIndex();
        const piece = allPieces[currentShuffleIndex];
        if (!piece) {
            root.innerHTML = '<p class="recommendation-note">No recommendations are available.</p>';
            return;
        }

        root.innerHTML =
            '<div class="recommendation-item">' +
                entryEmbedButton(piece) +
                '<h2>' + esc(piece.owner) + '</h2>' +
                '<h3>' + esc(piece.title) + '</h3>' +
                renderNote(piece.note) +
                player(piece) +
            '</div>';

        syncRecommendationPlayers(root);
    };

    const installControls = () => {
        const style = document.createElement('style');
        style.textContent = [
            '.recommendation-controls{position:absolute;top:20px;right:20px;display:flex;flex-direction:column;align-items:stretch;gap:8px;z-index:1000;}',
            '.recommendation-controls .start-level-toggle{position:static;justify-content:flex-start;}',
            '#shuffle-actions{display:none;width:100%;justify-content:center;box-sizing:border-box;padding:18px 20px 2px;}',
            '#shuffle-actions.visible{display:flex;}',
            '#shuffle-button{background-color:#b3262d;color:#fff;border:3px solid #fff;border-radius:8px;padding:12px 28px;font-family:Futura,sans-serif;font-size:1.05em;font-weight:bold;letter-spacing:.08em;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.3);transition:transform .2s,background-color .2s;}',
            '#shuffle-button:hover{background-color:#d33a42;transform:scale(1.05);}',
            '#shuffle-button:active{transform:scale(.98);}',
            'body.shuffle-mode #recommendations{width:100%;}',
            'body.shuffle-mode .recommendation-item{margin-top:24px;}',
            '@media screen and (max-width:700px){.recommendation-controls{top:14px;right:14px;}.recommendation-controls .start-level-toggle{padding:8px 10px;font-size:.8em;}}'
        ].join('');
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

            if (enabled) renderShuffle();
            else renderNormal();
        };

        shuffleToggle.addEventListener('change', applyShuffleMode);
        shuffleButton.addEventListener('click', renderShuffle);
    };

    root.addEventListener('click', event => {
        const button = event.target.closest('.recommendation-entry-embed');
        if (!button || !root.contains(button)) return;

        const videoId = button.dataset.video;
        entryEmbedOverrides.set(videoId, !effectiveEmbedState(videoId));
        const item = button.closest('.recommendation-item, .recommendation-extra-item');
        if (item) syncRecommendationPlayers(item);
    });

    async function init() {
        try {
            const response = await fetch(CONFIG.dataUrl);
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const catalog = await response.json();
            recommendations = catalog[CONFIG.groupsField] || [];
            allPieces = recommendations.flatMap(group =>
                (group[CONFIG.membersField] || []).flatMap(member => {
                    const owner = member[CONFIG.memberNameField];
                    return [
                        { ...member.main, owner },
                        ...(member.additional || []).map(piece => ({ ...piece, owner }))
                    ];
                })
            );

            renderNormal();
            installControls();
            embedToggle.addEventListener('change', () => {
                entryEmbedOverrides.clear();
                syncRecommendationPlayers();
            });
        } catch (error) {
            console.error('Failed to load ' + CONFIG.errorLabel + ' recommendations:', error);
            root.innerHTML = '<p class="recommendation-note">The recommendations could not be loaded.</p>';
        }
    }

    init();
})();
