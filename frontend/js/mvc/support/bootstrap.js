import { initSupportPage } from './supportController.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSupportPage());
} else {
  initSupportPage();
}
