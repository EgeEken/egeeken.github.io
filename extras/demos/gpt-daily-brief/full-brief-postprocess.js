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
    if (/marxist/.test(value)) return 'marxist_fragment';
    if (/philosophy|political fragment/.test(value)) return 'philosophy_fragments';
    if (/french/.test(value)) return 'french_usage';
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

  function lineEntry(line, index) {
    const marker = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);
    if (!marker) return null;
    const body = marker[1];
    const typeMatch = body.match(/^\*\*(Classical|Jazz(?:\s*\/\s*fusion)?|Other|Different lane)[^*]*\*\*/i);
    if (!typeMatch) return null;

    const rawType = typeMatch[1].toLowerCase();
    const type = rawType.startsWith('jazz') ? 'jazz' : rawType === 'classical' ? 'classical' : 'other';
    const label = type === 'classical' ? 'Classical' : type === 'jazz' ? 'Jazz' : 'Other';
    const links = [...body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
    const youtube = links.find((item) => /(?:youtube\.com|youtu\.be)/i.test(item[2]));
    const url = youtube?.[2] || '';

    let strong = typeMatch[0].replace(/^\*\*|\*\*$/g, '');
    strong = strong.replace(/^(Classical|Jazz(?:\s*\/\s*fusion)?|Other|Different lane)\s*(?:—|:)?\s*/i, '');
    let piece = plain(strong).replace(/[.:—\s]+$/, '');
    if (!piece && youtube) piece = plain(youtube[1]);
    if (!piece) piece = `${label} recommendation ${index + 1}`;

    let description = plain(body);
    const prefix = new RegExp(`^${label}(?:\\s*\\/\\s*fusion)?\\s*(?:—|:)?\\s*`, 'i');
    description = description.replace(prefix, '');
    if (description.toLowerCase().startsWith(piece.toLowerCase())) {
      description = description.slice(piece.length).replace(/^[\s.:—-]+/, '');
    }

    return {
      type,
      label,
      piece,
      performer: '',
      url,
      videoId: youtubeId(url),
      description
    };
  }

  function parseMusic(markdown) {
    const body = musicBody(markdown);
    if (!body) return null;
    const entries = body.split(/\r?\n/).map(lineEntry).filter(Boolean);
    if (entries.length < 3) return null;
    const queue = body.match(/\[[^\]]*(?:queue|playlist|play all)[^\]]*\]\((https?:\/\/www\.youtube\.com\/watch_videos\?[^)]+)\)/i)?.[1] || '';
    return { items: entries.slice(-3), queue };
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
