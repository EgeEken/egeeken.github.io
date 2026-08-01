(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const dataPattern = /(?:^|\/)data\/(\d{4}-\d{2}-\d{2})\.json(?:[?#].*)?$/;

  const plain = (value) => String(value || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  function stableId(title, current) {
    const value = plain(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/^paris\b/.test(value)) return 'paris_events';
    if (/^cs\b|computer science|ai development/.test(value)) return 'cs_ai';
    if (/technical|research idea/.test(value)) return 'technical_idea';
    if (/non[- ]?cs science/.test(value)) return 'non_cs_science';
    if (/geopolitic|political economy/.test(value)) return 'geopolitics';
    if (/signal.*noise/.test(value)) return 'signal_vs_noise';
    if (/marxist|marxist quote/.test(value)) return 'marxist_fragment';
    if (/philosophy|political fragment/.test(value)) return 'philosophy_fragments';
    if (/french|language note/.test(value)) return 'french_usage';
    if (/music/.test(value)) return 'music';
    if (/unrelated|fresh fact/.test(value)) return 'unrelated_fact';
    if (/puzzle|dilemma|morning problem/.test(value)) return 'puzzle';
    if (/source notes/.test(value)) return 'sources';
    return current;
  }

  function youtubeId(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1) || null;
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
      return parsed.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function musicBody(markdown) {
    const match = String(markdown || '').match(/^##\s+(?:\d+\.\s*)?[^\n]*music[^\n]*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
    return match?.[1] || '';
  }

  function parseMusic(markdown) {
    const body = musicBody(markdown);
    if (!body) return null;

    const lines = body.replace(/\r/g, '').split('\n');
    const entries = [];
    let current = null;
    let queue = '';

    const finish = () => {
      if (!current) return;
      const continuation = current.continuation
        .filter((line) => line.trim() && !/^#{3,6}\s+/.test(line.trim()))
        .join('\n');
      const description = plain([current.inlineDescription, continuation].filter(Boolean).join('\n'));
      entries.push({
        type: current.type,
        label: current.label,
        piece: current.piece,
        performer: '',
        url: current.url,
        videoId: youtubeId(current.url),
        description
      });
      current = null;
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const queueMatch = line.match(/\[[^\]]*(?:queue|playlist|play all)[^\]]*\]\((https?:\/\/www\.youtube\.com\/watch_videos\?[^)]+)\)/i);
      if (queueMatch) {
        queue = queueMatch[1];
        continue;
      }

      const start = line.match(/^\s*(?:[-*]|\d+[.)])\s+\*\*(Classical|Jazz(?:\s*\/\s*fusion)?|Other|Different lane)(?:\s*(?:—|:))?\s*([^*]*)\*\*\s*(.*)$/i);
      if (start) {
        finish();
        const rawType = start[1].toLowerCase();
        const type = rawType.startsWith('jazz') ? 'jazz' : rawType === 'classical' ? 'classical' : 'other';
        const label = type === 'classical' ? 'Classical' : type === 'jazz' ? 'Jazz' : 'Other';
        const afterBold = start[3] || '';
        const allLinks = [...line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
        const youtube = allLinks.find((item) => /(?:youtube\.com|youtu\.be)/i.test(item[2]));
        const url = youtube?.[2] || '';
        let piece = plain(start[2]);
        if (!piece && allLinks.length) piece = plain(allLinks[0][1]);
        if (!piece) piece = `${label} recommendation ${entries.length + 1}`;

        let inlineDescription = afterBold;
        if (!start[2] && allLinks.length) inlineDescription = inlineDescription.replace(allLinks[0][0], '');
        inlineDescription = inlineDescription
          .replace(/\s*(?:—|-)?\s*\*\*\d{1,2}\/10\.?\*\*.*$/i, '')
          .replace(/\s*(?:—|-)?\s*\d{1,2}\/10\.?\s*.*$/i, '');

        current = { type, label, piece, url, inlineDescription, continuation: [] };
        continue;
      }

      if (current) current.continuation.push(line);
    }
    finish();

    if (entries.length < 3) return null;
    return { items: entries.slice(-3), queue };
  }

  function disableEmbeds(items) {
    for (const item of items || []) {
      const id = item.videoId || youtubeId(item.url);
      if (id) item.embedVideoId = id;
      item.videoId = null;
    }
  }

  window.fetch = async function fullBriefPostprocessFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const match = url && url.match(dataPattern);
    const response = await previousFetch(input, init);
    if (!match || !response.ok) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data.sections)) return response;

      data.sections.forEach((section) => {
        section.id = stableId(section.title, section.id);
      });

      const markdownResponse = await previousFetch(`data/full/${match[1]}.md`, { cache: 'no-store' });
      if (markdownResponse.ok) {
        const markdown = await markdownResponse.text();
        const parsedMusic = parseMusic(markdown);
        const music = data.sections.find((section) => section.id === 'music');
        if (music && parsedMusic) {
          music.items = parsedMusic.items;
          if (parsedMusic.queue) music.queue = parsedMusic.queue;
          music.content = '';
        }
      }

      const music = data.sections.find((section) => section.id === 'music');
      if (music) disableEmbeds(music.items);

      return new Response(`${JSON.stringify(data)}\n`, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (error) {
      console.warn('Could not postprocess the full brief archive entry.', error);
      return response;
    }
  };
})();
