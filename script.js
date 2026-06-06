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


document.addEventListener("DOMContentLoaded", async () => {
  const gallery = document.getElementById("photo-gallery");

  try {
    const response = await fetch("assets/photography.json");
    if (!response.ok) throw new Error("HTTP " + response.status);

    const images = await response.json();
    console.log("Loaded images:", images);

    images.forEach(file => {
      const img = document.createElement("img");
      img.src = "assets/photography/" + file;
      img.alt = "Photography work: " + file;
      img.classList.add("photo");
      img.onerror = () => console.error("Image failed to load:", img.src);
      gallery.appendChild(img);
    });
  } catch (err) {
    console.error("Failed to load photography.json:", err);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const gallery = document.getElementById("art-gallery");

  try {
    const response = await fetch("assets/art.json");
    if (!response.ok) throw new Error("HTTP " + response.status);

    const images = await response.json();
    console.log("Loaded images:", images);

    images.forEach(file => {
      const img = document.createElement("img");
      img.src = "assets/art/" + file;
      img.alt = "Art work: " + file;
      img.classList.add("photo");
      img.onerror = () => console.error("Image failed to load:", img.src);
      gallery.appendChild(img);
    });
  } catch (err) {
    console.error("Failed to load art.json:", err);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    document.body.addEventListener("click", e => {
      document.querySelectorAll(".photo.expanded, .favorite img.expanded, #art-gallery img.photo.expanded")
          .forEach(img => img.classList.remove("expanded"));
      if (e.target.matches(".photo, .favorite img, #art-gallery img.photo") && !e.target.classList.contains("expanded")) {
        e.target.classList.toggle("expanded");
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const moreSections = document.querySelectorAll(".recommendation-more");

  moreSections.forEach(section => {
    const item = section.previousElementSibling;
    const toggle = section.querySelector(".recommendation-more-toggle");
    const content = section.querySelector(".recommendation-more-content");
    let hideTimer = null;
    if (!toggle || !content) return;

    const setHovering = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      section.classList.add("hovering");
    };

    const scheduleHide = () => {
      if (section.classList.contains("expanded")) return;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        section.classList.remove("hovering");
      }, 3000);
    };

    if (item && item.classList.contains("recommendation-item")) {
      item.addEventListener("mouseenter", setHovering);
      item.addEventListener("mouseleave", scheduleHide);
    }

    section.addEventListener("mouseenter", setHovering);
    section.addEventListener("mouseleave", scheduleHide);

    toggle.addEventListener("click", () => {
      const isExpanded = section.classList.toggle("expanded");
      toggle.setAttribute("aria-expanded", String(isExpanded));
      content.setAttribute("aria-hidden", String(!isExpanded));
      toggle.textContent = isExpanded ? "Hide more from this composer" : "More from this composer";
      if (!isExpanded) {
        scheduleHide();
      } else {
        setHovering();
      }
    });
  });
});


document.addEventListener("DOMContentLoaded", () => {
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    document.querySelectorAll(".programming-project a").forEach(link => {
      link.addEventListener("contextmenu", e => e.preventDefault());
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggle-embeds");
  if (!toggle) return;

  const players = document.querySelectorAll(".recommendation-player");

  players.forEach(player => {
    const iframe = player.querySelector("iframe");
    if (!iframe) return;

    const videoId = (iframe.dataset.src.split("/embed/")[1] || "").split(/[?&]/)[0];
    const link = document.createElement("a");
    link.className = "recommendation-link";
    link.href = "https://www.youtube.com/watch?v=" + videoId;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = '<span class="recommendation-link-icon">►</span> Watch on YouTube';
    player.appendChild(link);
  });

  const applyEmbedState = () => {
    players.forEach(player => {
      const iframe = player.querySelector("iframe");
      const link = player.querySelector(".recommendation-link");
      if (!iframe || !link) return;

      if (toggle.checked) {
        if (!iframe.src) iframe.src = iframe.dataset.src;
        iframe.style.display = "";
        link.style.display = "none";
      } else {
        iframe.style.display = "none";
        link.style.display = "";
      }
    });
  };

  toggle.addEventListener("change", applyEmbedState);
  applyEmbedState();
});