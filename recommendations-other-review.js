(() => {
    'use strict';

    const STORAGE_KEY = 'otherMusicRecommendationReviewV1';
    let sourceGenres = [];
    let pendingIssue = null;
    let undoTimer = null;

    const loadState = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                version: 1,
                removals: parsed.removals && typeof parsed.removals === 'object' ? parsed.removals : {}
            };
        } catch {
            return { version: 1, removals: {} };
        }
    };

    let state = loadState();

    const saveState = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        updateDownloadLabel();
    };

    const entryKey = (genre, artist, id) => genre + '::' + artist + '::' + id;

    const findOriginal = (genre, artist, id) => {
        const group = sourceGenres.find(item => item.genre === genre);
        const entry = group?.artists?.find(item => item.artist === artist);
        if (!entry) return { originalRole: 'unknown', originalIndex: -1 };

        if ((entry.main.id || entry.main.video) === id) {
            return { originalRole: 'main', originalIndex: 0 };
        }

        const index = (entry.additional || []).findIndex(piece => (piece.id || piece.video) === id);
        return index >= 0
            ? { originalRole: 'additional', originalIndex: index }
            : { originalRole: 'unknown', originalIndex: -1 };
    };

    const filterCatalog = catalog => catalog.map(group => {
        const artists = (group.artists || []).map(artist => {
            const pieces = [artist.main, ...(artist.additional || [])].filter(piece => {
                const id = piece.id || piece.video;
                return !state.removals[entryKey(group.genre, artist.artist, id)];
            });

            if (!pieces.length) return null;

            const filtered = { ...artist, main: pieces[0] };
            if (pieces.length > 1) filtered.additional = pieces.slice(1);
            else delete filtered.additional;
            return filtered;
        }).filter(Boolean);

        return artists.length ? { ...group, artists } : null;
    }).filter(Boolean);

    const rerender = () => window.refreshOtherRecommendations?.();

    const showUndo = (key, record) => {
        let toast = document.getElementById('other-review-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'other-review-toast';
            toast.innerHTML = '<span class="other-review-toast-text"></span><button type="button">Undo</button>';
            document.body.appendChild(toast);
        }

        toast.querySelector('.other-review-toast-text').textContent = 'Removed ' + record.title;
        toast.hidden = false;
        toast.querySelector('button').onclick = () => {
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

    const removeEntry = (entry, removalType, issue = '') => {
        const key = entryKey(entry.genre, entry.artist, entry.id);
        const original = findOriginal(entry.genre, entry.artist, entry.id);
        const record = {
            genre: entry.genre,
            artist: entry.artist,
            title: entry.title,
            id: entry.id,
            video: entry.video || null,
            youtube: entry.video ? 'https://www.youtube.com/watch?v=' + entry.video : null,
            removalType,
            issue: issue || null,
            ...original,
            removedAt: new Date().toISOString()
        };

        state.removals[key] = record;
        saveState();
        rerender();
        showUndo(key, record);
    };

    const closeModal = () => {
        const modal = document.getElementById('other-review-modal');
        if (!modal) return;
        modal.hidden = true;
        document.body.classList.remove('other-review-modal-open');
        pendingIssue = null;
    };

    const ensureModal = () => {
        let modal = document.getElementById('other-review-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'other-review-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="other-review-modal-backdrop"></div>' +
            '<div class="other-review-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="other-review-modal-title">' +
                '<h2 id="other-review-modal-title">What’s the issue?</h2>' +
                '<p class="other-review-modal-piece"></p>' +
                '<textarea rows="6" placeholder="Describe what should be changed, moved, renamed, or removed..."></textarea>' +
                '<div class="other-review-modal-actions">' +
                    '<button type="button" class="other-review-cancel">Cancel</button>' +
                    '<button type="button" class="other-review-submit">Submit & remove locally</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.querySelector('.other-review-modal-backdrop').addEventListener('click', closeModal);
        modal.querySelector('.other-review-cancel').addEventListener('click', closeModal);
        modal.querySelector('.other-review-submit').addEventListener('click', () => {
            if (!pendingIssue) return;

            const textarea = modal.querySelector('textarea');
            const issue = textarea.value.trim();
            if (!issue) {
                textarea.classList.add('invalid');
                textarea.focus();
                return;
            }

            const entry = pendingIssue;
            closeModal();
            removeEntry(entry, 'issue', issue);
        });

        modal.querySelector('textarea').addEventListener('input', event => {
            event.currentTarget.classList.remove('invalid');
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closeModal();
        });

        return modal;
    };

    const openModal = entry => {
        const modal = ensureModal();
        pendingIssue = entry;
        modal.querySelector('.other-review-modal-piece').textContent = entry.artist + ' — ' + entry.title;
        const textarea = modal.querySelector('textarea');
        textarea.value = '';
        modal.hidden = false;
        document.body.classList.add('other-review-modal-open');
        setTimeout(() => textarea.focus(), 0);
    };

    const decorate = root => {
        root.querySelectorAll('[data-review-id]').forEach(item => {
            if (item.querySelector(':scope > .other-review-actions')) return;

            const entry = {
                genre: item.dataset.reviewGenre || '',
                artist: item.dataset.reviewArtist || '',
                title: item.dataset.reviewTitle || '',
                id: item.dataset.reviewId || '',
                video: item.dataset.reviewVideo || ''
            };
            if (!entry.genre || !entry.artist || !entry.id) return;

            const actions = document.createElement('div');
            actions.className = 'other-review-actions';
            actions.innerHTML =
                '<button type="button" class="other-review-action other-review-delete" aria-label="Remove this entry" title="Remove this entry">×</button>' +
                '<button type="button" class="other-review-action other-review-issue" aria-label="Report an issue with this entry" title="Report an issue with this entry">−</button>';

            actions.querySelector('.other-review-delete').addEventListener('click', event => {
                event.stopPropagation();
                removeEntry(entry, 'delete');
            });

            actions.querySelector('.other-review-issue').addEventListener('click', event => {
                event.stopPropagation();
                openModal(entry);
            });

            item.appendChild(actions);
        });
    };

    const updateDownloadLabel = () => {
        const button = document.getElementById('other-review-download');
        if (!button) return;
        const count = Object.keys(state.removals).length;
        button.textContent = 'Download review JSON (' + count + ')';
    };

    const downloadReview = () => {
        const payload = {
            version: 1,
            page: 'recommendations-other',
            exportedAt: new Date().toISOString(),
            removals: Object.values(state.removals).sort((a, b) => a.removedAt.localeCompare(b.removedAt))
        };

        const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'other-music-recommendations-review.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const installStyles = () => {
        if (document.getElementById('other-review-styles')) return;

        const style = document.createElement('style');
        style.id = 'other-review-styles';
        style.textContent = [
            '.other-review-page .recommendation-entry-embed{right:50px;}',
            '.other-review-actions{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;z-index:12;}',
            '.other-review-action{width:32px;height:32px;padding:0;border:2px solid rgba(255,255,255,.95);border-radius:7px;color:#fff;font:700 22px/25px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.28);transition:transform .15s,filter .15s;}',
            '.other-review-action:hover{transform:scale(1.08);filter:brightness(1.08);}',
            '.other-review-delete{background:#b3262d;}',
            '.other-review-issue{background:#d2a21d;}',
            '#other-review-download{position:static;border:0;text-align:left;cursor:pointer;}',
            '.recommendation-player-missing{display:flex;justify-content:center;align-items:center;min-height:54px;margin-top:12px;color:#666;font-style:italic;}',
            '#other-review-modal[hidden],#other-review-toast[hidden]{display:none;}',
            '#other-review-modal{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}',
            '.other-review-modal-backdrop{position:absolute;inset:0;background:rgba(8,12,16,.72);backdrop-filter:blur(3px);}',
            '.other-review-modal-dialog{position:relative;width:min(560px,92vw);box-sizing:border-box;padding:24px;background:#f3f3f3;color:#252525;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.45);}',
            '.other-review-modal-dialog h2{margin:0 0 8px;font-size:1.35em;}',
            '.other-review-modal-piece{margin:0 0 16px;color:#555;font-size:.9em;}',
            '.other-review-modal-dialog textarea{width:100%;box-sizing:border-box;resize:vertical;padding:12px;border:2px solid #bbb;border-radius:8px;font:inherit;background:#fff;color:#222;}',
            '.other-review-modal-dialog textarea.invalid{border-color:#b3262d;}',
            '.other-review-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}',
            '.other-review-modal-actions button{padding:10px 16px;border:0;border-radius:7px;font:inherit;cursor:pointer;}',
            '.other-review-cancel{background:#d8d8d8;color:#222;}',
            '.other-review-submit{background:#d2a21d;color:#fff;font-weight:bold;}',
            'body.other-review-modal-open{overflow:hidden;}',
            '#other-review-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:5200;display:flex;align-items:center;gap:14px;max-width:min(680px,90vw);padding:12px 16px;background:#243646;color:#fff;border-radius:9px;box-shadow:0 5px 18px rgba(0,0,0,.35);font-size:.9em;}',
            '#other-review-toast button{border:0;border-radius:6px;padding:7px 12px;background:#f2f2f2;color:#223;cursor:pointer;font-weight:bold;}',
            '@media screen and (max-width:700px){.other-review-page .recommendation-entry-embed{right:46px;}.other-review-action{width:29px;height:29px;font-size:19px;}}'
        ].join('');
        document.head.appendChild(style);
    };

    const installControls = () => {
        installStyles();
        ensureModal();

        const controls = document.querySelector('.recommendation-controls');
        if (!controls || document.getElementById('other-review-download')) return;

        const button = document.createElement('button');
        button.id = 'other-review-download';
        button.type = 'button';
        button.className = 'start-level-toggle';
        button.addEventListener('click', downloadReview);
        controls.appendChild(button);
        updateDownloadLabel();
    };

    window.OtherReview = {
        setSource(catalog) {
            sourceGenres = catalog;
        },
        filterCatalog,
        decorate,
        installControls
    };

    installStyles();
})();