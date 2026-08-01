(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const fullBriefPattern = /^((?:.*\/)?data\/full\/)(\d{4}-\d{2}-\d{2})\.md(?:[?#].*)?$/;

  window.fetch = async function multipartFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const match = url && url.match(fullBriefPattern);
    if (!match) return nativeFetch(input, init);

    const direct = await nativeFetch(input, init);
    if (direct.ok) return direct;

    const parts = [];
    for (let index = 1; index <= 4; index += 1) {
      const response = await nativeFetch(`${match[1]}${match[2]}.part${index}.md`, { cache: 'no-store' });
      if (!response.ok) break;
      parts.push(await response.text());
    }

    if (!parts.length) return direct;
    return new Response(parts.join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    });
  };
})();
