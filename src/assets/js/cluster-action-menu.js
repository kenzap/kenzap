function initClusterActionMenus(Dropdown, root = document) {
    root.querySelectorAll('.cluster-actions-toggle').forEach(toggle => {
        Dropdown.getOrCreateInstance(toggle, {
            offset: [0, 8],
            popperConfig: config => {
                const header = root.querySelector('navigation-header .fixed-top');
                const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
                const menu = toggle.parentNode.querySelector('.dropdown-menu');
                menu.style.setProperty('--cluster-menu-header-height', `${headerBottom}px`);
                const bounds = {
                    boundary: [], rootBoundary: 'viewport',
                    padding: { top: headerBottom + 8, right: 8, bottom: 8, left: 8 }
                };

                // Fixed positioning escapes the scrolling table; reserve space for the header.
                return {
                    ...config,
                    strategy: 'fixed',
                    modifiers: [
                        ...(config.modifiers || []),
                        { name: 'flip', options: bounds },
                        { name: 'preventOverflow', options: { ...bounds, altAxis: true, tether: false } }
                    ]
                };
            }
        });
    });
}

module.exports = { initClusterActionMenus };
