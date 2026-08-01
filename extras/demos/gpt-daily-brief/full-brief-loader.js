(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const dataPattern = /(?:^|\/)data\/(\d{4}-\d{2}-\d{2})\.json(?:[?#].*)?$/;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function inlineMarkdown(value) {
    const placeholders = [];
    let text = String(value ?? '').replace(/`([^`]+)`/g, (_, code) => {
      const token = `@@INLINE${placeholders.length}@@`;
      placeholders.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

    text = escapeHtml(text)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>');

    placeholders.forEach((html, index) => {
      text = text.replace(`@@INLINE${index}@@`, html);
    });
    return text;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const html = [];
    let paragraph = [];
    let list = null;
    let blockquote = [];
    let code = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${list.type}>`);
      list = null;
    };
    const flushQuote = () => {
      if (!blockquote.length) return;
      html.push(`<blockquote>${blockquote.map(inlineMarkdown).join('<br>')}</blockquote>`);
      blockquote = [];
    };
    const flushAll = () => {
      flushParagraph();
      flushList();
      flushQuote();
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (code !== null) {
        if (/^```/.test(line)) {
          html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
          code = null;
        } else {
          code.push(raw);
        }
        continue;
      }
      if (/^```/.test(line)) {
        flushAll();
        code = [];
        continue;
      }
      if (!line.trim()) {
        flushAll();
        continue;
      }

      let match = line.match(/^(#{3,6})\s+(.+)$/);
      if (match) {
        flushAll();
        const level = Math.min(4, match[1].length);
        html.push(`<h${level}>${inlineMarkdown(match[2])}</h${level}>`);
        continue;
      }

      match = line.match(/^>\s?(.*)$/);
      if (match) {
        flushParagraph();
        flushList();
        blockquote.push(match[1]);
        continue;
      }

      match = line.match(/^[-*]\s+(.+)$/);
      if (match) {
        flushParagraph();
        flushQuote();
        if (!list || list.type !== 'ul') {
          flushList();
          list = { type: 'ul', items: [] };
        }
        list.items.push(match[1]);
        continue;
      }

      match = line.match(/^\d+[.)]\s+(.+)$/);
      if (match) {
        flushParagraph();
        flushQuote();
        if (!list || list.type !== 'ol') {
          flushList();
          list = { type: 'ol', items: [] };
        }
        list.items.push(match[1]);
        continue;
      }

      flushList();
      flushQuote();
      paragraph.push(line.trim());
    }

    if (code !== null) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    flushAll();
    return html.join('');
  }

  function sectionId(title) {
    const text = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (/paris event/.test(text)) return 'paris_events';
    if (/cs and ai|computer science|ai developments/.test(text)) return 'cs_ai';
    if (/technical idea|technical \/ research/.test(text)) return 'technical_idea';
    if (/non[- ]?cs science/.test(text)) return 'non_cs_science';
    if (/geopolitics|political economy/.test(text)) return 'geopolitics';
    if (/signal versus noise|signal vs noise/.test(text)) return 'signal_vs_noise';
    if (/marxist/.test(text)) return 'marxist_fragment';
    if (/philosophy|political fragments/.test(text)) return 'philosophy_fragments';
    if (/french/.test(text)) return 'french_usage';
    if (/music/.test(text)) return 'music';
    if (/unrelated fact|fun fact/.test(text)) return 'unrelated_fact';
    if (/puzzle|dilemma|problem/.test(text)) return 'puzzle';
    return text.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'section';
  }

  function youtubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1) || null;
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
      return parsed.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function plainMarkdown(value) {
    return String(value || '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      .replace(/\*\*|__/g, '')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s{2,}\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseMusic(body) {
    const lines = body.replace(/\r/g, '').split('\n');
    const items = [];
    let current = null;
    let queue = '';

    const finish = () => {
      if (!current) return;
      current.description = plainMarkdown(current.descriptionLines.join('\n'));
      delete current.descriptionLines;
      items.push(current);
      current = null;
    };

    for (const line of lines) {
      const queueMatch = line.match(/\[([^\]]*(?:queue|playlist)[^\]]*)\]\((https?:\/\/www\.youtube\.com\/watch_videos\?[^)]+)\)/i);
      if (queueMatch) {
        queue = queueMatch[2];
        continue;
      }

      const itemMatch = line.match(/^\s*\d+[.)]\s+\*\*(Classical|Jazz(?:\s*\/\s*fusion)?|Other)[^*]*:\*\*\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*(.*)$/i);
      if (itemMatch) {
        finish();
        const rawType = itemMatch[1].toLowerCase();
        const type = rawType.startsWith('jazz') ? 'jazz' : rawType;
        current = {
          type,
          label: type === 'jazz' ? 'Jazz' : type === 'other' ? 'Other' : 'Classical',
          piece: plainMarkdown(itemMatch[2]),
          performer: '',
          url: itemMatch[3],
          videoId: youtubeId(itemMatch[3]),
          descriptionLines: itemMatch[4] ? [itemMatch[4]] : []
        };
        continue;
      }

      if (current) current.descriptionLines.push(line);
    }
    finish();

    if (items.length !== 3) {
      const links = [...body.matchAll(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^)]+)\)/gi)]
        .filter((match) => !/watch_videos/.test(match[2]))
        .slice(0, 3);
      if (links.length === 3) {
        const labels = ['Classical', 'Jazz', 'Other'];
        return {
          queue,
          items: links.map((match, index) => ({
            type: labels[index].toLowerCase(),
            label: labels[index],
            piece: plainMarkdown(match[1]),
            performer: '',
            url: match[2],
            videoId: youtubeId(match[2]),
            description: ''
          }))
        };
      }
    }
    return { queue, items };
  }

  function parseFullBrief(markdown, date) {
    const text = String(markdown || '').replace(/\r/g, '');
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? plainMarkdown(titleMatch[1]) : `Daily Brief — ${date}`;
    const sectionPattern = /^##\s+(?:\d+\.\s*)?(.+)$/gm;
    const matches = [...text.matchAll(sectionPattern)];
    const sections = matches.map((match, index) => {
      const visibleTitle = plainMarkdown(match[1]);
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      const body = text.slice(start, end).trim();
      const id = sectionId(visibleTitle);
      const section = {
        id,
        number: index + 1,
        title: visibleTitle,
        content: markdownToHtml(body)
      };
      if (id === 'music') {
        const parsedMusic = parseMusic(body);
        if (parsedMusic.items.length === 3) {
          section.items = parsedMusic.items;
          section.queue = parsedMusic.queue;
          section.content = '';
        }
      }
      return section;
    });

    return {
      schemaVersion: 1,
      date,
      title,
      readingTime: '10–15 min',
      sections
    };
  }

  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const match = url && url.match(dataPattern);
    if (!match) return nativeFetch(input, init);

    const date = match[1];
    const markdownResponse = await nativeFetch(`data/full/${date}.md`, { cache: 'no-store' });
    if (!markdownResponse.ok) return nativeFetch(input, init);

    const parsed = parseFullBrief(await markdownResponse.text(), date);
    return new Response(`${JSON.stringify(parsed)}\n`, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };
})();
