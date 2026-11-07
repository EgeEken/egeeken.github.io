document.addEventListener('DOMContentLoaded', function () {
    filterProjects('ALL');
    setActiveButton(document.querySelector('#tag-selector button[data-tag="ALL"]'));
});

function filterProjects(tags) {
    if (!Array.isArray(tags)) {
        tags = [tags];
    }

    const projects = document.querySelectorAll('.programming-project');

    projects.forEach(project => {
        const projectTags = (project.dataset.tags || '').split(' ');
        const showProject = tags.includes('ALL') || tags.every(tag => projectTags.includes(tag));
        project.style.display = showProject ? 'block' : 'none';
    });

    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));

    const clicked = document.querySelector(`#tag-selector button[data-tag="${tags[0]}"]`);
    if (clicked) clicked.classList.add('active');
}

function filterMusicProjects(tags) {
    if (!Array.isArray(tags)) {
        tags = [tags];
    }

    const projects = document.querySelectorAll('.music-project');

    projects.forEach(project => {
        const projectTags = (project.dataset.tags || '').split(' ');
        const showProject = tags.includes('ALL') || tags.every(tag => projectTags.includes(tag));
        project.style.display = showProject ? 'block' : 'none';
    });

    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));

    const clicked = document.querySelector(`#tag-selector button[data-tag="${tags[0]}"]`);
    if (clicked) clicked.classList.add('active');
}

function setActiveButton(button) {
    const allButtons = document.querySelectorAll('#tag-selector button');
    allButtons.forEach(btn => btn.classList.remove('active'));
    if (button) button.classList.add('active');
}


function setupPhotoFilters(gallery, photos) {
    const selector = document.querySelector('#tag-selector.photo-filters');
    if (!selector) return;

    const events = [
        { tag: 'MOMENTS_LAB_OFF_SITE', label: 'Moments Lab Off-Site', disclaimer: true },
        { tag: 'FIGHT_NIGHT_9', label: 'Fight Night 9 (Kickboxing Event)', disclaimer: false },
        { tag: 'COCA_COLA_RECRUITMENT', label: 'Coca-Cola Recruitment Event', disclaimer: true }
    ];
    const categories = Array.from(selector.querySelectorAll('.photo-categories button'));
    const eventRow = selector.querySelector('#photo-event-filters');
    const disclaimer = selector.querySelector('#photo-event-disclaimer');
    const availableEvents = events.filter(event => photos.some(photo => photo.tags.includes(event.tag)));
    const hasTag = tag => photos.some(photo => photo.tags.includes(tag));

    categories.forEach(button => {
        button.hidden = button.dataset.tag !== 'ALL' && !hasTag(button.dataset.tag);
    });
    availableEvents.forEach(event => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.event = event.tag;
        button.textContent = event.label;
        eventRow.appendChild(button);
    });

    let category = 'ALL';
    let selectedEvent = availableEvents.find(event => event.tag === 'FIGHT_NIGHT_9')?.tag || availableEvents[0]?.tag;

    const render = () => {
        gallery.querySelectorAll('img').forEach(img => {
            const tags = img.dataset.tags.split(' ');
            img.hidden = category !== 'ALL' && (
                !tags.includes(category) || (category === 'EVENTS' && !tags.includes(selectedEvent))
            );
        });
        categories.forEach(button => {
            const active = button.dataset.tag === category;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        eventRow.hidden = category !== 'EVENTS';
        eventRow.querySelectorAll('button').forEach(button => {
            const active = button.dataset.event === selectedEvent;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        disclaimer.hidden = category !== 'EVENTS' || !events.find(event => event.tag === selectedEvent)?.disclaimer;
    };

    categories.forEach(button => button.addEventListener('click', () => {
        category = button.dataset.tag;
        if (category === 'EVENTS') {
            selectedEvent = availableEvents.find(event => event.tag === 'FIGHT_NIGHT_9')?.tag || availableEvents[0]?.tag;
        }
        render();
    }));
    eventRow.addEventListener('click', event => {
        const button = event.target.closest('button[data-event]');
        if (!button) return;
        selectedEvent = button.dataset.event;
        render();
    });
    render();
}

async function loadGallery(galleryId, source, assetDirectory, altPrefix) {
    const gallery = document.getElementById(galleryId);
    if (!gallery) return;

    try {
        const response = await fetch(source);
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const images = await response.json();
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                if (entry.target.dataset.srcset) entry.target.srcset = entry.target.dataset.srcset;
                entry.target.src = entry.target.dataset.src;
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '600px' });
        const fragment = document.createDocumentFragment();
        images.forEach(file => {
            const filename = file.file;
            const img = document.createElement('img');
            img.width = file.width;
            img.height = file.height;
            img.style.aspectRatio = `${file.width} / ${file.height}`;
            img.dataset.original = assetDirectory + filename;
            img.dataset.src = file.preview || img.dataset.original;
            if (file.srcset) img.dataset.srcset = file.srcset;
            img.sizes = '(max-width: 750px) calc((92vw - 12px) / 2), (max-width: 1100px) calc((92vw - 32px) / 3), (max-width: 1599px) calc((92vw - 48px) / 4), 288px';
            img.alt = altPrefix + filename;
            img.classList.add('photo');
            if (galleryId === 'photo-gallery') img.dataset.tags = file.tags.join(' ');
            img.onerror = () => console.error('Image failed to load:', img.src);
            fragment.appendChild(img);
        });
        gallery.appendChild(fragment);
        if (galleryId === 'photo-gallery') setupPhotoFilters(gallery, images);
        gallery.querySelectorAll('img').forEach(img => observer.observe(img));
    } catch (err) {
        console.error(`Failed to load ${source}:`, err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadGallery('photo-gallery', 'assets/photography.json', 'assets/photography/', 'Photography work: ');
    loadGallery('art-gallery', 'assets/art.json', 'assets/art/', 'Art work: ');
});

document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('#photo-gallery, #art-gallery, .favorite')) return;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
        <button class="lightbox-close" aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
        </button>
        <button class="lightbox-nav lightbox-prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 5 8 12 15 19"></polyline></svg>
        </button>
        <img class="lightbox-img" alt="">
        <button class="lightbox-nav lightbox-next" aria-label="Next">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 5 16 12 9 19"></polyline></svg>
        </button>
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('.lightbox-img');
    let group = [];
    let index = 0;

    const show = i => {
        index = (i + group.length) % group.length;
        imgEl.src = group[index].dataset.original || group[index].src;
        imgEl.alt = group[index].alt;
    };

    const open = (els, i) => {
        group = els;
        overlay.classList.toggle('single', group.length < 2);
        show(i);
        overlay.classList.add('open');
        document.body.classList.add('lightbox-active');
    };

    const close = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('lightbox-active');
        imgEl.src = '';
    };

    document.addEventListener('click', e => {
        const target = e.target.closest('#photo-gallery img, #art-gallery img, .favorite img');
        if (!target) return;
        const container = target.closest('#photo-gallery, #art-gallery, .favorite');
        const els = Array.from(container.querySelectorAll('img')).filter(img => !img.hidden);
        open(els, els.indexOf(target));
    });

    overlay.querySelector('.lightbox-close').addEventListener('click', close);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
    overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
    });

    document.addEventListener('keydown', e => {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') show(index - 1);
        if (e.key === 'ArrowRight') show(index + 1);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
        document.querySelectorAll('.programming-project a').forEach(link => {
            link.addEventListener('contextmenu', e => e.preventDefault());
        });
    }
});
