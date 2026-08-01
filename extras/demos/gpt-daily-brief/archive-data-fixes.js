(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const target = /(?:^|\/)data\/2026-07-24\.json(?:[?#].*)?$/;

  window.fetch = async function archiveFixFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const response = await previousFetch(input, init);
    if (!url || !target.test(url) || !response.ok) return response;

    try {
      const data = await response.clone().json();
      const music = data.sections?.find((section) => section.id === 'music');
      if (!music) return response;

      music.items = [
        {
          type: 'classical',
          label: 'Classical',
          piece: 'Sergei Lyapunov — Violin Concerto in D minor, Op. 61 — Yulian Sitkovetsky',
          performer: '',
          url: 'https://www.youtube.com/watch?v=PKHyVnKkHwQ',
          videoId: 'PKHyVnKkHwQ',
          description: 'A one-movement late-Romantic concerto with an embedded scherzo and adagio. Recorded rating: 5/10; not a fan.'
        },
        {
          type: 'jazz',
          label: 'Jazz',
          piece: 'Giorgi Mikadze Trio — Dolls Are Laughing',
          performer: '',
          url: 'https://www.youtube.com/watch?v=B2QgI5FTRfs',
          videoId: 'B2QgI5FTRfs',
          description: 'A Georgian melody reworked for piano, bass and drums. Recorded rating: 7/10; neat, though more ambience than a compelling foreground piece.'
        },
        {
          type: 'other',
          label: 'Other',
          piece: 'Silvana Estrada — Te Guardo — live on KEXP',
          performer: '',
          url: 'https://www.youtube.com/watch?v=OMG7ePKkLnI',
          videoId: 'OMG7ePKkLnI',
          description: 'Voice, cuatro and a restrained arrangement built around a strong melodic line. Recorded rating: 7/10; nice.'
        }
      ];
      music.queue = 'https://www.youtube.com/watch_videos?video_ids=8c1--cUeaNI,twBcGa-SMZ8,-4FWJmHfLC0,PKHyVnKkHwQ,B2QgI5FTRfs,OMG7ePKkLnI';

      return new Response(`${JSON.stringify(data)}\n`, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (error) {
      console.warn('Could not apply historical archive correction.', error);
      return response;
    }
  };
})();
