(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const responseCache = new Map();
  const pageDirectory = new URL('.', document.baseURI).pathname;
  const cacheableDataPath = /^data\/(?:index\.json|\d{4}-\d{2}-\d{2}\.json|feedback\/[^/]+\.md)$/;

  function cacheKey(input, init) {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || 'GET').toUpperCase();
    if (method !== 'GET') return null;

    const url = new URL(request?.url || String(input), document.baseURI);
    if (url.origin !== window.location.origin || !url.pathname.startsWith(pageDirectory)) return null;

    const relativePath = url.pathname.slice(pageDirectory.length);
    return cacheableDataPath.test(relativePath) ? url.href : null;
  }

  async function snapshot(response) {
    return {
      body: await response.arrayBuffer(),
      headers: [...response.headers.entries()],
      status: response.status,
      statusText: response.statusText
    };
  }

  function restore(saved) {
    return new Response(saved.body.slice(0), {
      headers: saved.headers,
      status: saved.status,
      statusText: saved.statusText
    });
  }

  window.fetch = async function cachedDailyBriefFetch(input, init) {
    const key = cacheKey(input, init);
    if (!key) return previousFetch(input, init);

    let pending = responseCache.get(key);
    if (!pending) {
      pending = previousFetch(input, init).then(async (response) => {
        const saved = await snapshot(response);
        if (!response.ok) responseCache.delete(key);
        return saved;
      });
      responseCache.set(key, pending);
      pending.catch(() => responseCache.delete(key));
    }

    return restore(await pending);
  };
})();
