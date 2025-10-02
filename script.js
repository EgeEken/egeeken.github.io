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
