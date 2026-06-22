const AuthConfig = {
    // API base URL - override via window.API_BASE_URL (set before this script) or meta name="api-base-url"
    apiBaseUrl: (typeof window !== 'undefined' && window.API_BASE_URL) ||
        (typeof document !== 'undefined' && document.querySelector('meta[name="api-base-url"]')?.getAttribute('content')) ||
        '/api',
    endpoints: {
        login: '/Account/login',
        register: '/Account/register',
        logout: '/Account/logout',
        verify: '/Account/verify',
        myEvents: '/Events/my/events',
        myBookings: '/Bookings/my'
    },

    // Page Routes
    pages: {
        home: '/html/index.html',
        login: '/html/signin.html',
        register: '/html/register.html',
        protected: [
            'my-events.html',
            'create-event.html',
            'manage-event.html',
            'notification.html',
            'fav-events.html',
            'profile.html',
            'wallet.html',
            'pay-for-event.html',
            'ticket.html',
            'reserve-seat.html', // Require sign-in to book seats
            'contact-form.html', // Support form is for signed-in users only
            'support.html'
        ],
        public: [
            'index.html',
            'book-event.html',
            'event-details.html',
            'event-team.html',
            'event-flow-data.html',
            'accepted-event.html' // Assuming these are public, adjust if needed
        ]
    },

    // Current Page Helper
    getCurrentPage: function () {
        const path = window.location.pathname;
        let page = path.split('/').pop().toLowerCase();
        // Handle root/empty path
        if (page === '' || page === '/') return 'index.html';
        if (page === 'profile') return 'profile.html';
        if (page === 'wallet') return 'wallet.html';
        // Remove query params and hashes
        return page.split('?')[0].split('#')[0];
    }
};

// Make it globally available
window.AuthConfig = AuthConfig;

