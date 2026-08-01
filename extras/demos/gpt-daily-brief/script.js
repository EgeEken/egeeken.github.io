(() => {
  "use strict";

  const archiveSelect = document.querySelector("#brief-date");
  const dateLabel = document.querySelector("#brief-date-label");
  const readingTime = document.querySelector("#reading-time");
  const sectionNav = document.querySelector("#section-nav");
  const status = document.querySelector("#status");
  const content = document.querySelector("#brief-content");
  const exportPanel = document.querySelector("#export-panel");
  const generalFeedback = document.querySelector("#general-feedback");
  const exportButton = document.querySelector("#export-feedback");
  const clearButton = document.querySelector("#clear-feedback");
  const exportStatus = document.querySelector("#export-status");

  let archive = null;
  let activeBrief = null;
  let saveTimer = null;

  const storageKey = (date) => `gpt-daily-brief-feedback:${date}`;

  function nullableText(value) {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  function loadSavedFeedback(date) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(date))) || {};
    } catch (error) {
      console.warn("Could not parse saved feedback.", error);
      return {};
    }
  }

  function collectFeedback() {
    if (!activeBrief) return null;

    const sections = activeBrief.sections.map((section) => {
      const textarea = document.querySelector(`[data-section-feedback="${section.id}"]`);
      return {
        section_id: section.id,
        section_title: section.title,
        feedback: textarea ? nullableText(textarea.value) : null
      };
    });

    const musicSection = activeBrief.sections.find((section) => section.id === "music");
    const music = musicSection
      ? musicSection.items.map((item) => {
          const slider = document.querySelector(`[data-rating="${item.type}"]`);
          const commentary = document.querySelector(`[data-music-commentary="${item.type}"]`);
          const ratingTouched = slider?.dataset.touched === "true";
          return {
            type: item.type,
            label: item.label,
            piece: item.piece,
            url: item.url,
            rating: ratingTouched ? Number(slider.value) : null,
            commentary: commentary ? nullableText(commentary.value) : null
          };
        })
      : [];

    return {
      schema_version: 1,
      source: "egeeken.github.io/extras/demos/gpt-daily-brief",
      brief_date: activeBrief.date,
      brief_title: activeBrief.title,
      exported_at: new Date().toISOString(),
      section_feedback: sections,
      music_feedback: music,
      overall_feedback: nullableText(generalFeedback.value)
    };
  }

  function saveFeedback() {
    if (!activeBrief) return;
    const payload = collectFeedback();
    try {
      localStorage.setItem(storageKey(activeBrief.date), JSON.stringify(payload));
      exportStatus.textContent = "Saved locally.";
      window.setTimeout(() => {
        if (exportStatus.textContent === "Saved locally.") exportStatus.textContent = "";
      }, 1200);
    } catch (error) {
      exportStatus.textContent = "Local autosave is unavailable in this browser.";
      console.warn("Could not save feedback.", error);
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveFeedback, 250);
  }

  function feedbackBox(section, saved) {
    const sectionSaved = saved.section_feedback?.find((entry) => entry.section_id === section.id);
    const wrapper = document.createElement("div");
    wrapper.className = "feedback-box";
    wrapper.innerHTML = `
      <label>
        Section feedback <span>(optional)</span>
        <textarea
          rows="3"
          data-section-feedback="${section.id}"
          placeholder="What worked, what did not, or what should change next time…"
        ></textarea>
      </label>
    `;
    const textarea = wrapper.querySelector("textarea");
    textarea.value = sectionSaved?.feedback || "";
    textarea.addEventListener("input", scheduleSave);
    return wrapper;
  }

  function musicCard(item, savedMusic) {
    const saved = savedMusic?.find((entry) => entry.type === item.type) || {};
    const rating = Number.isFinite(saved.rating) ? saved.rating : 5;
    const touched = Number.isFinite(saved.rating);

    const card = document.createElement("article");
    card.className = "music-card";
    card.innerHTML = `
      <div class="player-frame">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}"
          title="${item.piece.replaceAll('"', "&quot;")}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
      <div class="music-card-content">
        <p class="track-type">${item.label}</p>
        <h3>${item.piece}</h3>
        ${item.performer ? `<p class="performer">${item.performer}</p>` : ""}
        <p class="track-description">${item.description}</p>
        <a class="track-link" href="${item.url}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
      </div>
      <div class="track-feedback">
        <div class="rating-row">
          <label for="rating-${item.type}">Rating</label>
          <input
            id="rating-${item.type}"
            type="range"
            min="0"
            max="10"
            step="1"
            value="${rating}"
            data-rating="${item.type}"
            data-touched="${touched}"
            aria-describedby="rating-value-${item.type}"
          >
          <output id="rating-value-${item.type}" class="rating-value">${touched ? `${rating}/10` : "Not rated"}</output>
        </div>
        <button class="clear-rating" type="button" data-clear-rating="${item.type}">Clear rating</button>
        <textarea
          rows="3"
          data-music-commentary="${item.type}"
          placeholder="Optional commentary for this recommendation…"
          aria-label="${item.label} commentary"
        ></textarea>
      </div>
    `;

    const slider = card.querySelector(`[data-rating="${item.type}"]`);
    const output = card.querySelector(`#rating-value-${item.type}`);
    const commentary = card.querySelector(`[data-music-commentary="${item.type}"]`);
    const clearRating = card.querySelector(`[data-clear-rating="${item.type}"]`);

    commentary.value = saved.commentary || "";

    slider.addEventListener("input", () => {
      slider.dataset.touched = "true";
      output.textContent = `${slider.value}/10`;
      scheduleSave();
    });

    commentary.addEventListener("input", scheduleSave);

    clearRating.addEventListener("click", () => {
      slider.dataset.touched = "false";
      slider.value = "5";
      output.textContent = "Not rated";
      scheduleSave();
    });

    return card;
  }

  function renderSection(section, saved) {
    const article = document.createElement("article");
    article.className = "brief-section";
    article.id = `section-${section.id}`;

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.innerHTML = `
      <span class="section-number">${section.number}</span>
      <div>
        <h2>${section.title}</h2>
        ${section.subtitle ? `<p class="section-subtitle">${section.subtitle}</p>` : ""}
      </div>
    `;
    article.appendChild(heading);

    const body = document.createElement("div");
    body.className = "section-body";

    if (section.id === "music") {
      const intro = document.createElement("div");
      intro.className = "music-intro";
      intro.innerHTML = `
        <div>${section.content}</div>
        <a class="queue-button" href="${section.queue}" target="_blank" rel="noopener noreferrer">Open three-video queue ↗</a>
      `;
      body.appendChild(intro);

      const grid = document.createElement("div");
      grid.className = "music-grid";
      const savedMusic = saved.music_feedback || [];
      section.items.forEach((item) => grid.appendChild(musicCard(item, savedMusic)));
      body.appendChild(grid);
    } else {
      body.innerHTML = section.content;
    }

    article.appendChild(body);
    article.appendChild(feedbackBox(section, saved));
    return article;
  }

  function renderNavigation(brief) {
    sectionNav.replaceChildren();
    brief.sections.forEach((section) => {
      const link = document.createElement("a");
      link.href = `#section-${section.id}`;
      link.textContent = `${section.number}. ${section.title.replace(/^Two /, "")}`;
      sectionNav.appendChild(link);
    });
  }

  function renderBrief(brief) {
    activeBrief = brief;
    const saved = loadSavedFeedback(brief.date);

    document.title = `Ege — ${brief.title}`;
    dateLabel.textContent = brief.title;
    readingTime.textContent = brief.readingTime || "";
    renderNavigation(brief);

    content.replaceChildren();
    brief.sections.forEach((section) => content.appendChild(renderSection(section, saved)));
    generalFeedback.value = saved.overall_feedback || "";
    generalFeedback.oninput = scheduleSave;

    status.hidden = true;
    content.hidden = false;
    exportPanel.hidden = false;
    exportStatus.textContent = "";
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return response.json();
  }

  async function loadBrief(date) {
    const record = archive.briefs.find((entry) => entry.date === date);
    if (!record) throw new Error(`No archive entry exists for ${date}.`);

    status.hidden = false;
    status.classList.remove("error");
    status.textContent = "Loading the brief…";
    content.hidden = true;
    exportPanel.hidden = true;

    const brief = await fetchJson(`data/${record.file}`);
    renderBrief(brief);
  }

  function populateArchive() {
    archiveSelect.replaceChildren();
    archive.briefs
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.date;
        option.textContent = entry.title;
        archiveSelect.appendChild(option);
      });

    archiveSelect.value = archive.latest;
    archiveSelect.disabled = false;
    archiveSelect.addEventListener("change", async () => {
      try {
        await loadBrief(archiveSelect.value);
        history.replaceState(null, "", `?date=${encodeURIComponent(archiveSelect.value)}`);
      } catch (error) {
        showError(error);
      }
    });
  }

  function showError(error) {
    console.error(error);
    status.hidden = false;
    status.classList.add("error");
    status.textContent = "The brief could not be loaded. The archive data may be temporarily unavailable.";
    content.hidden = true;
    exportPanel.hidden = true;
  }

  function exportFeedback() {
    const payload = collectFeedback();
    if (!payload) return;

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gpt-daily-brief-feedback-${activeBrief.date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    exportStatus.textContent = `Exported feedback for ${activeBrief.date}.`;
    saveFeedback();
  }

  function clearFeedback() {
    if (!activeBrief) return;
    const confirmed = window.confirm(`Clear all saved feedback for ${activeBrief.date}?`);
    if (!confirmed) return;

    localStorage.removeItem(storageKey(activeBrief.date));
    renderBrief(activeBrief);
    exportStatus.textContent = "Saved feedback cleared.";
  }

  async function initialise() {
    try {
      archive = await fetchJson("data/index.json");
      populateArchive();
      const requestedDate = new URLSearchParams(window.location.search).get("date");
      const validRequestedDate = archive.briefs.some((entry) => entry.date === requestedDate);
      const date = validRequestedDate ? requestedDate : archive.latest;
      archiveSelect.value = date;
      await loadBrief(date);
    } catch (error) {
      showError(error);
    }
  }

  exportButton.addEventListener("click", exportFeedback);
  clearButton.addEventListener("click", clearFeedback);
  initialise();
})();
