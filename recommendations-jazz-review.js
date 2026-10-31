(() => {
    'use strict';

    const STORAGE_KEY = 'jazzRecommendationReviewV2';
    let sourceRecommendations = [];
    let pendingIssue = null;
    let undoTimer = null;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);

    const loadState = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                version: 2,
                removals: parsed.removals && typeof parsed.removals === 'object' ? parsed.removals : {}
            };
        } catch {
            return { version: 2, removals: {} };
        }
    };

    let state = loadState();

    const saveState = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        updateDownloadLabel();
    };

    const entryKey = (artist, video) => artist + '::' + video;

    const findOriginal = (artist, video) => {
        const entry = sourceRecommendations.find(item => item.artist === artist);
        if (!entry) return { role: 'unknown', index: -1 };

        if (entry.main?.video === video) {
            return { role: 'main', index: 0 };
        }

        const additionalIndex = (entry.additional || []).findIndex(piece => piece.video === video);
        if (additionalIndex >= 0) {
            return { role: 'additional', index: additionalIndex };
        }

        return { role: 'unknown', index: -1 };
    };

    const filterCatalog = catalog => catalog.map(artist => {
        const pieces = [
            artist.main,
            ...(artist.additional || [])
        ].filter(piece => !state.removals[entryKey(artist.artist, piece.video)]);

        if (!pieces.length) return null;

        const filtered = {
            ...artist,
            main: pieces[0]
        };

        if (pieces.length > 1) {
            filtered.additional = pieces.slice(1);
        } else {
            delete filtered.additional;
        }

        return filtered;
    }).filter(Boolean);

    const getVideo = item => {
        const iframe = item.querySelector('iframe');
        if (!iframe) return '';
        const src = iframe.dataset.src || iframe.src || '';
        return (src.split('/embed/')[1] || '').split(/[?&]/)[0];
    };

    const getArtist = item => {
        if (item.classList.contains('recommendation-item')) {
            return item.querySelector('h2')?.textContent?.trim() || '';
        }

        const more = item.closest('.recommendation-more');
        return more?.previousElementSibling?.querySelector('h2')?.textContent?.trim() || '';
    };

    const getTitle = item => (
        item.querySelector('h3')?.textContent?.trim()
        || item.querySelector('h4')?.textContent?.trim()
        || ''
    );

    const rerender = () => {
        if (typeof window.refreshJazzRecommendations === 'function') {
            window.refreshJazzRecommendations();
        }
    };

    const showUndo = (key, record) => {
        let toast = document.getElementById('jazz-review-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'jazz-review-toast';
            toast.innerHTML = '<span class="jazz-review-toast-text"></span><button type="button">Undo</button>';
            document.body.appendChild(toast);
        }

        toast.querySelector('.jazz-review-toast-text').textContent = 'Removed ' + record.title;
        toast.hidden = false;

        const undoButton = toast.querySelector('button');
        undoButton.onclick = () => {
            delete state.removals[key];
            saveState();
            toast.hidden = true;
            rerender();
        };

        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(() => {
            toast.hidden = true;
        }, 7000);
    };

    const removeEntry = (artist, title, video, kind, issue = '') => {
        const key = entryKey(artist, video);
        const original = findOriginal(artist, video);
        const record = {
            artist,
            title,
            video,
            youtube: 'https://www.youtube.com/watch?v=' + video,
            removalType: kind,
            issue: issue || null,
            originalRole: original.role,
            originalIndex: original.index,
            removedAt: new Date().toISOString()
        };

        state.removals[key] = record;
        saveState();
        rerender();
        showUndo(key, record);
    };

    const closeModal = () => {
        const modal = document.getElementById('jazz-review-modal');
        if (!modal) return;
        modal.hidden = true;
        document.body.classList.remove('jazz-review-modal-open');
        pendingIssue = null;
    };

    const openModal = entry => {
        const modal = ensureModal();
        pendingIssue = entry;
        modal.querySelector('.jazz-review-modal-piece').textContent = entry.artist + ' — ' + entry.title;
        const textarea = modal.querySelector('textarea');
        textarea.value = '';
        modal.hidden = false;
        document.body.classList.add('jazz-review-modal-open');
        setTimeout(() => textarea.focus(), 0);
    };

    const ensureModal = () => {
        let modal = document.getElementById('jazz-review-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'jazz-review-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="jazz-review-modal-backdrop"></div>' +
            '<div class="jazz-review-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="jazz-review-modal-title">' +
                '<h2 id="jazz-review-modal-title">What\'s the issue?</h2>' +
                '<p class="jazz-review-modal-piece"></p>' +
                '<textarea rows="6" placeholder="Describe the issue with this entry..."></textarea>' +
                '<div class="jazz-review-modal-actions">' +
                    '<button type="button" class="jazz-review-cancel">Cancel</button>' +
                    '<button type="button" class="jazz-review-submit">Submit & remove</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.querySelector('.jazz-review-modal-backdrop').addEventListener('click', closeModal);
        modal.querySelector('.jazz-review-cancel').addEventListener('click', closeModal);
        modal.querySelector('.jazz-review-submit').addEventListener('click', () => {
            if (!pendingIssue) return;

            const textarea = modal.querySelector('textarea');
            const issue = textarea.value.trim();
            if (!issue) {
                textarea.focus();
                textarea.classList.add('invalid');
                return;
            }

            const entry = pendingIssue;
            closeModal();
            removeEntry(entry.artist, entry.title, entry.video, 'issue', issue);
        });

        modal.querySelector('textarea').addEventListener('input', event => {
            event.currentTarget.classList.remove('invalid');
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closeModal();
        });

        return modal;
    };

    const decorate = root => {
        root.querySelectorAll('.recommendation-item, .recommendation-extra-item').forEach(item => {
            if (item.querySelector(':scope > .jazz-review-actions')) return;

            const artist = getArtist(item);
            const title = getTitle(item);
            const video = getVideo(item);
            if (!artist || !title || !video) return;

            const actions = document.createElement('div');
            actions.className = 'jazz-review-actions';
            actions.innerHTML =
                '<button type="button" class="jazz-review-action jazz-review-delete" aria-label="Remove this entry" title="Remove this entry">×</button>' +
                '<button type="button" class="jazz-review-action jazz-review-issue" aria-label="Report an issue and remove this entry" title="Report an issue and remove this entry">−</button>';

            actions.querySelector('.jazz-review-delete').addEventListener('click', event => {
                event.stopPropagation();
                removeEntry(artist, title, video, 'delete');
            });

            actions.querySelector('.jazz-review-issue').addEventListener('click', event => {
                event.stopPropagation();
                openModal({ artist, title, video });
            });

            item.appendChild(actions);
        });
    };

    const updateDownloadLabel = () => {
        const button = document.getElementById('jazz-review-download');
        if (!button) return;
        const count = Object.keys(state.removals).length;
        button.textContent = 'Download removals JSON (' + count + ')';
    };

    const downloadReview = () => {
        const payload = {
            version: 2,
            page: 'recommendations-jazz',
            exportedAt: new Date().toISOString(),
            removals: Object.values(state.removals).sort((a, b) => a.removedAt.localeCompare(b.removedAt))
        };

        const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'jazz-recommendations-removals.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const installStyles = () => {
        if (document.getElementById('jazz-review-styles')) return;

        const style = document.createElement('style');
        style.id = 'jazz-review-styles';
        style.textContent = [
            '.recommendation-item,.recommendation-extra-item{position:relative;box-sizing:border-box;}',
            '.recommendation-item{padding-left:58px;padding-right:58px;}',
            '.recommendation-extra-item{padding-left:46px;padding-right:46px;}',
            '.jazz-review-actions{position:absolute;top:9px;right:9px;display:flex;flex-direction:column;gap:6px;z-index:10;}',
            '.jazz-review-action{width:30px;height:30px;padding:0;border:2px solid rgba(255,255,255,.9);border-radius:7px;color:#fff;font:700 22px/24px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.28);transition:transform .15s,filter .15s;}',
            '.jazz-review-action:hover{transform:scale(1.08);filter:brightness(1.08);}',
            '.jazz-review-delete{background:#b3262d;}',
            '.jazz-review-issue{background:#d2a21d;}',
            '#jazz-review-download{position:static;border:0;justify-content:flex-start;text-align:left;}',
            '#jazz-review-modal[hidden],#jazz-review-toast[hidden]{display:none;}',
            '#jazz-review-modal{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}',
            '.jazz-review-modal-backdrop{position:absolute;inset:0;background:rgba(8,12,16,.72);backdrop-filter:blur(3px);}',
            '.jazz-review-modal-dialog{position:relative;width:min(560px,92vw);box-sizing:border-box;padding:24px;background:#f3f3f3;color:#252525;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.45);}',
            '.jazz-review-modal-dialog h2{margin:0 0 8px;font-size:1.35em;}',
            '.jazz-review-modal-piece{margin:0 0 16px;color:#555;font-size:.9em;}',
            '.jazz-review-modal-dialog textarea{width:100%;box-sizing:border-box;resize:vertical;padding:12px;border:2px solid #bbb;border-radius:8px;font:inherit;background:#fff;color:#222;}',
            '.jazz-review-modal-dialog textarea.invalid{border-color:#b3262d;}',
            '.jazz-review-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}',
            '.jazz-review-modal-actions button{padding:10px 16px;border:0;border-radius:7px;font:inherit;cursor:pointer;}',
            '.jazz-review-cancel{background:#d8d8d8;color:#222;}',
            '.jazz-review-submit{background:#d2a21d;color:#fff;font-weight:bold;}',
            'body.jazz-review-modal-open{overflow:hidden;}',
            '#jazz-review-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:5200;display:flex;align-items:center;gap:14px;max-width:min(680px,90vw);padding:12px 16px;background:#243646;color:#fff;border-radius:9px;box-shadow:0 5px 18px rgba(0,0,0,.35);font-size:.9em;}',
            '#jazz-review-toast button{border:0;border-radius:6px;padding:7px 12px;background:#f2f2f2;color:#223;cursor:pointer;font-weight:bold;}',
            '@media screen and (max-width:700px){.recommendation-item{padding-left:48px;padding-right:48px;}.recommendation-extra-item{padding-left:40px;padding-right:40px;}.jazz-review-action{width:27px;height:27px;font-size:19px;}}'
        ].join('');
        document.head.appendChild(style);
    };

    const installControls = () => {
        installStyles();
        ensureModal();

        const controls = document.querySelector('.recommendation-controls');
        if (!controls || document.getElementById('jazz-review-download')) return;

        const button = document.createElement('button');
        button.id = 'jazz-review-download';
        button.type = 'button';
        button.className = 'start-level-toggle';
        button.addEventListener('click', downloadReview);
        controls.appendChild(button);
        updateDownloadLabel();
    };

    window.JazzReview = {
        setSource(catalog) {
            sourceRecommendations = catalog;
        },
        filterCatalog,
        decorate,
        installControls
    };

    installStyles();
})();