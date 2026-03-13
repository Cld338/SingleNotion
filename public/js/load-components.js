document.addEventListener('DOMContentLoaded', () => {
    const loadComponent = async (elementId, filePath) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        try {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            element.innerHTML = html;
        } catch (error) {
            console.error(`Failed to load ${filePath}:`, error);
        }
    };

    // Navbar 및 Footer 비동기 로드
    loadComponent('navbar', '/components/navbar.html');
    loadComponent('footer', '/components/footer.html');
});