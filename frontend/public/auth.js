// Authentication utility functions
const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';

// Check if user is logged in
function isLoggedIn() {
  const token = localStorage.getItem('token');
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  return token && isLoggedIn === 'true';
}

// Get auth token
function getAuthToken() {
  return localStorage.getItem('token');
}

// Get user info
function getUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

// Logout function
async function logout() {
  try {
    const token = getAuthToken();
    if (token) {
      // Call logout endpoint (optional, mainly for server-side cleanup if needed)
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
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.setItem('isLoggedIn', 'false');
    
    // Redirect to sign in
    window.location.href = '/html/signin.html';
  }
}

// Update navigation based on login status
function updateNavigation() {
  const navLinks = document.querySelectorAll('nav a[href="signin.html"], nav a[href="/html/signin.html"]');
  const loggedIn = isLoggedIn();
  
  navLinks.forEach(link => {
    if (loggedIn) {
      link.textContent = 'Log Out';
      link.href = '#';
      link.onclick = (e) => {
        e.preventDefault();
        logout();
      };
    } else {
      link.textContent = 'Sign In';
      link.href = '/html/signin.html';
      link.onclick = null;
    }
  });
}

// Check authentication and redirect if needed
function checkAuth(redirectTo = '/html/signin.html') {
  if (!isLoggedIn()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// Initialize navigation on page load
document.addEventListener('DOMContentLoaded', () => {
  updateNavigation();
});





