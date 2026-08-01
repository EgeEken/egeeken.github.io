(() => {
  'use strict';

  const select = document.querySelector('#brief-date');
  const briefContent = document.querySelector('#brief-content');
  if (!select || !briefContent) return;

  let embedsEnabled = false;
  let renderToken = 0;
  let queued = false;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function youtubeId(item) {
    if (item?.embedVideoId) return item.embedVideoId;
    if (item?.videoId) return item.videoId;
    try {
      const url = new URL(item?.url || '');
      if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function mediaMarkup(item) {
    const id = youtubeId(item);
    if (embedsEnabled && id) {
      return `<div class="player-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" title="${escapeHtml(item.piece || 'YouTube video')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
    }
    if (item?.url) {
      return `<div class="watch-link-frame"><a class="watch-youtube-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a></div>`;
    }
    return '';
  }

  function ensureToggle(section) {
    const intro = section.querySelector('.music-intro');
    if (!intro) return null;

    let actions = intro.querySelector('.music-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'music-actions';
      const queue = intro.querySelector('.queue-button');
      if (queue) actions.append(queue);
      intro.append(actions);
    }

    let label = actions.querySelector('.embed-toggle');
    if (!label) {
      label = document.createElement('label');
      label.className = 'embed-toggle';
      label.innerHTML = '<input type="checkbox" aria-label="Toggle YouTube embeds"><span>Toggle embeds</span>';
      actions.append(label);
      label.querySelector('input').addEventListener('change', (event) => {
        embedsEnabled = event.currentTarget.checked;
        queueRefresh();
      });
    }
    label.querySelector('input').checked = embedsEnabled;
    return label;
  }

  async function refresh() {
    const date = select.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const token = ++renderToken;

    const section = briefContent.querySelector('#section-music');
    if (!section) return;
    ensureToggle(section);

    try {
      const response = await fetch(`data/${date}.json`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (token !== renderToken || select.value !== date) return;
      const music = data.sections?.find((entry) => entry.id === 'music');
      if (!music?.items?.length) return;

      const cards = [...section.querySelectorAll('.music-card')];
      cards.forEach((card, index) => {
        card.querySelector('.player-frame, .watch-link-frame')?.remove();
        const item = music.items[index];
        if (!item) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = mediaMarkup(item);
        const media = wrapper.firstElementChild;
        if (media) card.prepend(media);
        card.classList.toggle('no-player', !(embedsEnabled && youtubeId(item)));
      });
    } catch (error) {
      console.warn('Could not update Daily Brief media controls.', error);
    }
  }

  function queueRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }

  select.addEventListener('change', queueRefresh);
  new MutationObserver(queueRefresh).observe(briefContent, { childList: true });
  queueRefresh();
})();
