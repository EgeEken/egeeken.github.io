document.addEventListener('DOMContentLoaded', function () {
    filterProjects('ALL');
    setActiveButton(document.querySelector('#tag-selector button[data-tag="ALL"]'));
});

function filterProjects(tags) {
    if (!Array.isArray(tags)) {
        tags = [tags];
    }

    const projects = document.querySelectorAll('.programming-project');

    projects.forEach(project => {
        const projectTags = (project.dataset.tags || '').split(' ');
        const showProject = tags.includes('ALL') || tags.every(tag => projectTags.includes(tag));
        project.style.display = showProject ? 'block' : 'none';
    });

    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));

    const clicked = document.querySelector(`#tag-selector button[data-tag="${tags[0]}"]`);
    if (clicked) clicked.classList.add('active');
}

function filterMusicProjects(tags) {
    if (!Array.isArray(tags)) {
        tags = [tags];
    }

    const projects = document.querySelectorAll('.music-project');

    projects.forEach(project => {
        const projectTags = (project.dataset.tags || '').split(' ');
        const showProject = tags.includes('ALL') || tags.every(tag => projectTags.includes(tag));
        project.style.display = showProject ? 'block' : 'none';
    });

    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));

    const clicked = document.querySelector(`#tag-selector button[data-tag="${tags[0]}"]`);
    if (clicked) clicked.classList.add('active');
}

function setActiveButton(button) {
    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));
    if (button) button.classList.add('active');
}

async function loadGallery(galleryId, source, assetDirectory, altPrefix) {
    const gallery = document.getElementById(galleryId);
    if (!gallery) return;

    try {
        const response = await fetch(source);
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const images = await response.json();
        console.log('Loaded images:', images);

        images.forEach(file => {
            const img = document.createElement('img');
            img.src = assetDirectory + file;
            img.alt = altPrefix + file;
            img.classList.add('photo');
            img.onerror = () => console.error('Image failed to load:', img.src);
            gallery.appendChild(img);
        });
    } catch (err) {
        console.error(`Failed to load ${source}:`, err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadGallery('photo-gallery', 'assets/photography.json', 'assets/photography/', 'Photography work: ');
    loadGallery('art-gallery', 'assets/art.json', 'assets/art/', 'Art work: ');
});

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
        <button class="lightbox-close" aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
        </button>
        <button class="lightbox-nav lightbox-prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 5 8 12 15 19"></polyline></svg>
        </button>
        <img class="lightbox-img" alt="">
        <button class="lightbox-nav lightbox-next" aria-label="Next">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 5 16 12 9 19"></polyline></svg>
        </button>
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('.lightbox-img');
    let group = [];
    let index = 0;

    const show = i => {
        index = (i + group.length) % group.length;
        imgEl.src = group[index].src;
        imgEl.alt = group[index].alt;
    };

    const open = (els, i) => {
        group = els;
        overlay.classList.toggle('single', group.length < 2);
        show(i);
        overlay.classList.add('open');
        document.body.classList.add('lightbox-active');
    };

    const close = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('lightbox-active');
        imgEl.src = '';
    };

    document.addEventListener('click', e => {
        const target = e.target.closest('#photo-gallery img, #art-gallery img, .favorite img');
        if (!target) return;
        const container = target.closest('#photo-gallery, #art-gallery, .favorite');
        const els = Array.from(container.querySelectorAll('img'));
        open(els, els.indexOf(target));
    });

    overlay.querySelector('.lightbox-close').addEventListener('click', close);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
    overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
    });

    document.addEventListener('keydown', e => {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') show(index - 1);
        if (e.key === 'ArrowRight') show(index + 1);
    });
});

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

document.addEventListener('DOMContentLoaded', () => {
    setupRecommendationMoreSections();
});

document.addEventListener('DOMContentLoaded', () => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
        document.querySelectorAll('.programming-project a').forEach(link => {
            link.addEventListener('contextmenu', e => e.preventDefault());
        });
    }
});

function syncRecommendationPlayers(scope = document) {
    const toggle = document.getElementById('toggle-embeds');
    if (!toggle) return;

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

        if (toggle.checked) {
            if (!iframe.src) iframe.src = iframe.dataset.src;
            iframe.style.display = '';
            link.style.display = 'none';
        } else {
            iframe.style.display = 'none';
            link.style.display = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle-embeds');
    if (!toggle) return;

    toggle.addEventListener('change', () => syncRecommendationPlayers());
    syncRecommendationPlayers();
});

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('recommendations');
    const embedToggle = document.getElementById('toggle-embeds');
    const embedLabel = document.querySelector('label[for="toggle-embeds"]');
    const header = root?.previousElementSibling?.id === 'shuffle-actions'
        ? root.previousElementSibling.previousElementSibling
        : document.querySelector('header');

    if (!root || !embedToggle || !embedLabel || !header || typeof recommendations === 'undefined') return;

    const subtitle = header.querySelector('h2');
    if (!subtitle) return;

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

    const normalSubtitle = subtitle.textContent;
    const shuffleSubtitle = 'One randomly selected recommendation, press shuffle to get a new one';
    const allPieces = recommendations.flatMap(group => group.composers.flatMap(composer => [
        { ...composer, composer: composer.composer },
        ...(composer.extras || []).map(piece => ({ ...piece, composer: composer.composer }))
    ]));
    let currentShuffleIndex = -1;

    const fallbackSlug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const renderNormal = () => {
        root.innerHTML = '';
        for (const group of recommendations) {
            root.insertAdjacentHTML('beforeend', `<div class="recommendation-era"><h2>${esc(group.era)}</h2></div>`);
            for (const composer of group.composers) {
                root.insertAdjacentHTML('beforeend', `<div class="recommendation-item"><h2>${esc(composer.composer)}</h2><h3>${esc(composer.title)}</h3>${note(composer)}${player(composer)}</div>`);
                if (composer.extras?.length) {
                    const extras = composer.extras.map(piece => `<div class="recommendation-extra-item"><h4>${esc(piece.title)}</h4>${note(piece)}${player(piece)}</div>`).join('');
                    root.insertAdjacentHTML('beforeend', `<div class="recommendation-more" data-composer="${esc(composer.slug || fallbackSlug(composer.composer))}"><button class="recommendation-more-toggle" type="button" aria-expanded="false">More from this composer</button><div class="recommendation-more-content" aria-hidden="true"><div class="recommendation-extra">${extras}</div></div></div>`);
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
        root.innerHTML = `<div class="recommendation-item"><h2>${esc(piece.composer)}</h2><h3>${esc(piece.title)}</h3>${note(piece)}${player(piece)}</div>`;
        syncRecommendationPlayers(root);
    };

    const applyShuffleMode = () => {
        const enabled = shuffleToggle.checked;
        document.body.classList.toggle('shuffle-mode', enabled);
        shuffleActions.classList.toggle('visible', enabled);
        subtitle.textContent = enabled ? shuffleSubtitle : normalSubtitle;

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
});
