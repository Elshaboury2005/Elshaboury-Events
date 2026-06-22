export function bindHeaderMenu(doc = document, win = window) {
  const header = doc.querySelector('header');
  const menuToggle = header?.querySelector('.menu-toggle');

  if (!header || !menuToggle || header.dataset.mvcHeaderMenuBound === 'true') {
    return;
  }

  header.dataset.mvcHeaderMenuBound = 'true';

  const setMenuState = (open) => {
    header.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = header.classList.contains('menu-open');
    setMenuState(!isOpen);
  });

  header.addEventListener('click', (event) => {
    if (win.innerWidth <= 768 && event.target.closest('nav a')) {
      setMenuState(false);
    }
  });

  win.addEventListener('resize', () => {
    if (win.innerWidth > 768) {
      setMenuState(false);
    }
  });
}
