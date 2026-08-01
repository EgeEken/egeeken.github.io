(() => {
  'use strict';

  const archiveSelect = document.querySelector('#brief-date');
  const briefContent = document.querySelector('#brief-content');
  const overallFeedback = document.querySelector('#general-feedback');
  const recordedPanel = document.querySelector('#recorded-feedback-panel');

  // The main renderer still keeps a reference to this node, so removing it here is safe
  // and prevents the old standalone recorded-feedback panel from appearing.
  recordedPanel?.remove();

  if (!archiveSelect || !briefContent || !overallFeedback) return;

  const feedbackCache = new Map();
  let archivePromise = null;
  let hydrationRun = 0;
  let queued = false;

  function plainMarkdown(value) {
    return String(value ?? '')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*/g, '')
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^>\s?/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function appendText(existing, addition) {
    if (!addition) return existing || '';
    return existing ? `${existing}\n\n${addition}` : addition;
  }

  function feedbackChunks(markdown) {
    const chunks = [];
    let current = null;

    for (const line of String(markdown || '').split(/\r?\n/)) {
      const heading = line.match(/^##\s+(.+)$/);
      if (heading) {
        if (current) chunks.push(current);
        current = { heading: plainMarkdown(heading[1]), lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
    }
    if (current) chunks.push(current);

    return chunks
      .map((chunk) => ({
        heading: chunk.heading,
        body: plainMarkdown(chunk.lines.join('\n'))
      }))
      .filter((chunk) => chunk.body);
  }

  function normaliseHeading(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function classifyHeading(heading, previousContext) {
    const text = normaliseHeading(heading);
    const targets = [];
    const add = (id) => {
      if (!targets.includes(id)) targets.push(id);
    };

    const perTrackMusic = /music (ratings?|reactions?)/.test(text) || /^music$/.test(text);
    if (perTrackMusic) return { targets: [], context: ['music'] };

    if (/paris|event correction|event feedback/.test(text)) add('paris_events');
    if (/\bcs\b|\bai\b|computer science/.test(text)) add('cs_ai');
    if (/technical|research idea/.test(text)) add('technical_idea');
    if (/non[- ]?cs science|science development/.test(text)) add('non_cs_science');
    if (/geopolit|international|foreign policy|nato/.test(text)) add('geopolitics');
    if (/signal.*noise/.test(text)) add('signal_vs_noise');
    if (/marx|engels|lenin|luxemburg/.test(text)) add('marxist_fragment');
    if (/philosoph|political fragment|political commentary/.test(text)) add('philosophy_fragments');
    if (/french|language note|language feedback/.test(text)) add('french_usage');
    if (/music|recommendation preference/.test(text)) add('music');
    if (/puzzle|dilemma|problem|thought[- ]provoking|moral luck|precommitment|teletransporter|sleeping beauty|conway|paradox/.test(text)) add('puzzle');

    if (!targets.length
      && /stable (preference|delivery)|durable preference|preference implications?/.test(text)
      && previousContext.includes('music')) {
      add('music');
    }

    if (!targets.length) add('overall');
    return {
      targets,
      context: targets.filter((target) => target !== 'overall')
    };
  }

  function parseRecordedFeedback(markdown) {
    const sectionFeedback = new Map();
    let overall = '';
    let previousContext = [];

    for (const chunk of feedbackChunks(markdown)) {
      const classification = classifyHeading(chunk.heading, previousContext);
      previousContext = classification.context;

      for (const target of classification.targets) {
        if (target === 'overall') {
          overall = appendText(overall, chunk.body);
        } else {
          sectionFeedback.set(target, appendText(sectionFeedback.get(target), chunk.body));
        }
      }
    }

    return { sectionFeedback, overall };
  }

  async function getArchive() {
    if (!archivePromise) {
      archivePromise = fetch('data/index.json', { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(`Archive request failed: ${response.status}`);
        return response.json();
      });
    }
    return archivePromise;
  }

  async function getRecordedFeedback(date) {
    if (feedbackCache.has(date)) return feedbackCache.get(date);

    const archive = await getArchive();
    const record = archive.briefs.find((entry) => entry.date === date);
    if (!record?.feedback) {
      const empty = { sectionFeedback: new Map(), overall: '' };
      feedbackCache.set(date, empty);
      return empty;
    }

    const response = await fetch(`data/${record.feedback}`, { cache: 'no-store' });
    const parsed = response.ok
      ? parseRecordedFeedback(await response.text())
      : { sectionFeedback: new Map(), overall: '' };
    feedbackCache.set(date, parsed);
    return parsed;
  }

  function waitForRenderedBrief(date, run, attempts = 0) {
    if (run !== hydrationRun || archiveSelect.value !== date) return Promise.resolve(false);
    if (!briefContent.hidden && briefContent.querySelector('[data-section-feedback]')) return Promise.resolve(true);
    if (attempts >= 80) return Promise.resolve(false);
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve(waitForRenderedBrief(date, run, attempts + 1)));
    });
  }

  async function hydrate() {
    const date = archiveSelect.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const run = ++hydrationRun;
    try {
      const [recorded, ready] = await Promise.all([
        getRecordedFeedback(date),
        waitForRenderedBrief(date, run)
      ]);
      if (!ready || run !== hydrationRun || archiveSelect.value !== date) return;

      for (const [sectionId, feedback] of recorded.sectionFeedback) {
        const textarea = briefContent.querySelector(`[data-section-feedback="${CSS.escape(sectionId)}"]`);
        if (textarea && !textarea.value.trim()) textarea.value = feedback;
      }

      if (!overallFeedback.value.trim() && recorded.overall) {
        overallFeedback.value = recorded.overall;
      }
    } catch (error) {
      console.warn('Could not hydrate recorded feedback into the form.', error);
    }
  }

  function queueHydration() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      hydrate();
    });
  }

  archiveSelect.addEventListener('change', queueHydration);
  new MutationObserver(queueHydration).observe(briefContent, { childList: true });
  queueHydration();
})();
