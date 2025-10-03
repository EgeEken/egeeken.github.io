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

    // Update button states
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
