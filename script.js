document.addEventListener('DOMContentLoaded', function () {

    function showCategory(category) {
        const tagSelector = document.getElementById('tag-selector');
        const categories = document.querySelectorAll('.category');
        categories.forEach(cat => {
            if (cat.id === category) {
                if (cat.style.display === 'none') {
                    cat.style.display = 'block';
                    if (category === 'programming') {
                        tagSelector.style.display = 'block';
                    } else {
                        tagSelector.style.display = 'none';
                    }
                } else {
                    cat.style.display = 'none';
                    tagSelector.style.display = 'none';
                }
            } else {
                cat.style.display = 'none';
            }
        });
    }

    const programmingButton = document.getElementById('programming-btn');
    const musicButton = document.getElementById('music-btn');
    showCategory('programming');
    programmingButton.addEventListener('click', () => showCategory('programming'));
    musicButton.addEventListener('click', () => showCategory('music'));
});

function filterProjects(tags) {
    if (!Array.isArray(tags)) {
        tags = [tags];
    }

    const projects = document.querySelectorAll('.category .programming-project');
    
    projects.forEach(project => {
        const projectTags = (project.dataset.tags || '').split(' ');

        const showProject = tags.includes('ALL') || tags.every(tag => projectTags.includes(tag));

        if (showProject) {
            project.style.display = 'block';
        } else {
            project.style.display = 'none';
        }
    });
}

