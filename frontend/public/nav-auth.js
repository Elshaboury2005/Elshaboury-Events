// Navigation Authentication Script
// Add this script to all pages to handle Sign In/Log Out button

(function() {
  'use strict';
  
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';
  
  // Check if user is logged in
  function isUserLoggedIn() {
    const token = localStorage.getItem('token');
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    return token && isLoggedIn === 'true';
  }
  
  // Logout function
  async function handleLogout() {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${API_BASE_URL}/Account/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.setItem('isLoggedIn', 'false');
      window.location.href = '/html/signin.html';
    }
  }
  
  // Update navigation button
  function updateAuthButton() {
    const signInLinks = document.querySelectorAll('nav a[href="signin.html"], nav a[href="/html/signin.html"]');
    const isLoggedIn = isUserLoggedIn();
    
    signInLinks.forEach(link => {
      if (isLoggedIn) {
        link.textContent = 'Log Out';
        link.href = '#';
        link.removeEventListener('click', handleLogout);
        link.addEventListener('click', (e) => {
          e.preventDefault();
          handleLogout();
        });
      } else {
        link.textContent = 'Sign In';
        link.href = '/html/signin.html';
        link.removeEventListener('click', handleLogout);
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthButton);
  } else {
    updateAuthButton();
  }
  
  // Also update on storage changes (for multi-tab support)
  window.addEventListener('storage', updateAuthButton);
})();




