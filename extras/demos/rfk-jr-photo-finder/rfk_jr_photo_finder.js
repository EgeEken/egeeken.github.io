const HISTOGRAM_URL = '../../../assets/rfk_jr_histograms.json';
const IMAGE_BASE_URL = '../../../assets/rfk_jr/';
const BINS_PER_CHANNEL = 32;
const CHANNEL_COUNT = 3;
const HISTOGRAM_LENGTH = BINS_PER_CHANNEL * CHANNEL_COUNT;
const MAX_SAMPLE_DIMENSION = 256;
const RESULT_COUNT = 10;

const input = document.getElementById('image-input');
const dropZone = document.getElementById('drop-zone');
const selectedImage = document.getElementById('selected-image');
const selectedPreview = document.getElementById('selected-preview');
const selectedName = document.getElementById('selected-name');
const chooseAnother = document.getElementById('choose-another');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results-section');
const resultsGrid = document.getElementById('results-grid');
const timingEl = document.getElementById('timing');
const canvas = document.getElementById('histogram-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

let photoIndex = null;
let previewUrl = null;

loadPhotoIndex();

input.addEventListener('change', () => {
    if (input.files && input.files[0]) {
        handleFile(input.files[0]);
    }
});

chooseAnother.addEventListener('click', () => {
    input.value = '';
    input.click();
});

document.addEventListener('dragover', event => {
    if (!hasFiles(event)) {
        return;
    }

    event.preventDefault();
    dropZone.classList.add('dragging');
});

document.addEventListener('dragleave', event => {
    if (!event.relatedTarget) {
        dropZone.classList.remove('dragging');
    }
});

document.addEventListener('drop', event => {
    if (!hasFiles(event)) {
        return;
    }

    event.preventDefault();
    dropZone.classList.remove('dragging');

    const file = Array.from(event.dataTransfer.files).find(item => item.type.startsWith('image/'));
    if (file) {
        handleFile(file);
    } else {
        setStatus('Drop an image file to search.', true);
    }
});

function hasFiles(event) {
    return event.dataTransfer &&
        Array.from(event.dataTransfer.types || []).includes('Files');
}

async function loadPhotoIndex() {
    try {
        const response = await fetch(HISTOGRAM_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();
        validateIndex(data);
        photoIndex = data;

        if (data.images.length === 0) {
            setStatus('No RFK Jr photos are indexed yet.');
        } else {
            setStatus('Ready — ' + data.images.length + ' photos indexed.');
        }
    } catch (error) {
        console.error(error);
        setStatus('Could not load the RFK Jr photo index.', true);
    }
}

function validateIndex(data) {
    if (!data ||
        data.bins_per_channel !== BINS_PER_CHANNEL ||
        !Array.isArray(data.images)) {
        throw new Error('Unexpected histogram index format.');
    }

    for (const image of data.images) {
        if (!image ||
            typeof image.file !== 'string' ||
            !Array.isArray(image.histogram) ||
            image.histogram.length !== HISTOGRAM_LENGTH) {
            throw new Error('Invalid histogram entry.');
        }
    }
}

async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        setStatus('Choose an image file.', true);
        return;
    }

    if (!photoIndex) {
        setStatus('The photo index is not available yet.', true);
        return;
    }

    if (photoIndex.images.length === 0) {
        setStatus('No RFK Jr photos are indexed yet.', true);
        return;
    }

    setStatus('Reading image…');
    resultsSection.hidden = true;

    try {
        const loaded = await loadImage(file);

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        previewUrl = loaded.url;
        selectedPreview.src = previewUrl;
        selectedName.textContent = file.name;
        selectedImage.hidden = false;

        const started = performance.now();
        const histogram = computeHistogram(loaded.image);
        const matches = rankMatches(histogram);
        const elapsed = performance.now() - started;

        renderMatches(matches);
        timingEl.textContent = 'Compared ' + photoIndex.images.length +
            ' photos in ' + elapsed.toFixed(1) + ' ms';
        resultsSection.hidden = false;
        setStatus('Showing the ' + matches.length + ' closest RGB histogram matches.');
    } catch (error) {
        console.error(error);
        setStatus('Could not read that image.', true);
    }
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => resolve({ image, url });
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image decode failed.'));
        };

        image.src = url;
    });
}

function computeHistogram(image) {
    const scale = Math.min(
        1,
        MAX_SAMPLE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
    );

    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const histogram = new Float32Array(HISTOGRAM_LENGTH);
    let pixelCount = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
            continue;
        }

        histogram[channelBin(0, pixels[i])] += 1;
        histogram[channelBin(1, pixels[i + 1])] += 1;
        histogram[channelBin(2, pixels[i + 2])] += 1;
        pixelCount += 1;
    }

    if (pixelCount === 0) {
        throw new Error('Image contains no visible pixels.');
    }

    for (let i = 0; i < histogram.length; i += 1) {
        histogram[i] /= pixelCount;
    }

    return histogram;
}

function channelBin(channel, value) {
    return channel * BINS_PER_CHANNEL +
        Math.min(BINS_PER_CHANNEL - 1, Math.floor(value * BINS_PER_CHANNEL / 256));
}

function rankMatches(queryHistogram) {
    return photoIndex.images
        .map(image => ({
            image,
            score: histogramIntersection(queryHistogram, image.histogram)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RESULT_COUNT);
}

function histogramIntersection(a, b) {
    let overlap = 0;

    for (let i = 0; i < HISTOGRAM_LENGTH; i += 1) {
        overlap += Math.min(a[i], b[i]);
    }

    return overlap / CHANNEL_COUNT;
}

function renderMatches(matches) {
    const fragment = document.createDocumentFragment();
    resultsGrid.replaceChildren();

    matches.forEach((match, index) => {
        const imageUrl = IMAGE_BASE_URL + encodeRelativePath(match.image.file);
        const card = document.createElement('a');
        card.className = 'match-card';
        card.href = imageUrl;
        card.target = '_blank';
        card.rel = 'noopener';

        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'RFK Jr match ' + (index + 1);
        image.loading = 'lazy';

        const rank = document.createElement('span');
        rank.className = 'match-rank';
        rank.textContent = '#' + (index + 1);

        const meta = document.createElement('div');
        meta.className = 'match-meta';

        const score = document.createElement('span');
        score.className = 'match-score';
        score.textContent = (match.score * 100).toFixed(1) + '% histogram overlap';

        const filename = document.createElement('span');
        filename.className = 'match-file';
        filename.textContent = match.image.file;
        filename.title = match.image.file;

        meta.append(score, filename);
        card.append(image, rank, meta);
        fragment.append(card);
    });

    resultsGrid.append(fragment);
}

function encodeRelativePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
}
