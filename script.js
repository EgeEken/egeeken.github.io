document.addEventListener('DOMContentLoaded', function () {
    const tagSelector = document.getElementById('tag-selector');
    const categories = document.querySelectorAll('.category');
    const programmingButton = document.getElementById('programming-btn');
    const musicButton = document.getElementById('music-btn');
    const otherButton = document.getElementById('other-btn');

    programmingButton.addEventListener('click', () => showCategory('programming'));
    musicButton.addEventListener('click', () => showCategory('music'));
    otherButton.addEventListener('click', () => showCategory('other'));

    function showCategory(category) {
        const portfolio = document.getElementById('portfolio');
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
        portfolio.classList.toggle('open');
    }

    showCategory('programming');

    const videoProjects = document.querySelectorAll('.category video');

    videoProjects.forEach(video => {
        video.addEventListener('loadeddata', function () {
            const projectInfo = video.parentElement.querySelector('.project-info');
            projectInfo.style.width = '80%';
            projectInfo.style.textAlign = 'center';
            projectInfo.style.color = '#fff';
            projectInfo.style.opacity = '0';
            projectInfo.style.transition = 'opacity 0.3s ease-in-out';

            video.parentElement.addEventListener('mouseenter', function () {
                projectInfo.style.opacity = '1';
            });

            video.parentElement.addEventListener('mouseleave', function () {
                projectInfo.style.opacity = '0';
            });
        });
    });
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

