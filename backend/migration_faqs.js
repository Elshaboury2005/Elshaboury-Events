const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting FAQs table migration...');

        // 1. Create FAQs table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS faqs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100) NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Created faqs table if needed');

        // 2. Check if table is empty
        const [rows] = await pool.execute('SELECT COUNT(*) AS cnt FROM faqs');
        const count = rows[0]?.cnt || 0;

        if (count === 0) {
            console.log('Seeding initial FAQs...');
            const initialFaqs = [
                // Booking & Tickets
                ['booking', 'How can I reserve a seat for an event?', 'You can browse available events on the "Book Event" page, select your preferred event, and click the "Reserve Seats" button to select your ticket type and exact seat number from the interactive seat map.', 1],
                ['booking', 'How do I access my tickets after confirmation?', 'All your active tickets are available in the "My Events" page under the "My Bookings" section. Click "View Tickets" to display your ticket details and QR code.', 2],
                ['booking', 'Can I modify my seat selection after payment?', 'Seat selections cannot be modified once payment is processed and confirmed. You can, however, cancel your booking for a refund according to the event\'s cancellation policy and make a new reservation.', 3],
                ['booking', 'How does the QR code check-in work at the entrance?', 'At the event entrance, the organizer will scan the QR code on your digital or printed ticket using their device to instantly verify its validity and check you in.', 4],
                ['booking', 'Can I transfer my ticket to another person?', 'Tickets are tied to your personal account for security, but the QR code can be scanned at the gate regardless of the attendee\'s name.', 5],

                // Payments & Wallet
                ['wallet', 'How can I top up my wallet balance?', 'Go to the "Wallet" page and click "Top-Up Balance". Select your preferred payment method (Credit Card or Fawry) and enter the amount you wish to add to complete the process.', 6],
                ['wallet', 'How can I withdraw funds from my wallet?', 'You can request a withdrawal directly from the Wallet page. Approved withdrawable funds will be transferred to your bank account or linked mobile wallet after verification.', 7],
                ['wallet', 'Can I pay for ticket bookings using my wallet balance?', 'Yes! On the checkout page, select "Wallet Balance" as your payment method for a fast, fee-free checkout.', 8],
                ['wallet', 'How do promo codes work?', 'Before confirming your booking, enter your discount code in the "Promo Code" input box and click "Apply" to instantly update the total price.', 9],
                ['wallet', 'Are there any fees for wallet top-ups or withdrawals?', 'Small transaction fees may apply depending on the payment provider. Any fees will be clearly displayed before confirming your transaction.', 10],

                // Accounts & Registration
                ['accounts', 'How do I create a new account?', 'Click "Sign In" in the navigation bar, choose "Create New Account", and fill in your details (name, email, phone number, and password) to register instantly.', 11],
                ['accounts', 'How can I update my profile information?', 'Go to the "Profile" page from the user dropdown menu to update your display name, email address, or phone number, and save the changes.', 12],
                ['accounts', 'What should I do if I forgot my password?', 'On the Sign In page, click "Forgot Password" and enter your registered email address to receive a secure link to reset it.', 13],
                ['accounts', 'Can I change my account type to organizer or venue owner?', 'Yes, you can register under a specific role or request an upgrade through your account settings by providing the required verification details.', 14],

                // Organizing Events
                ['organizing', 'How do I create and manage a new event?', 'Once your organizer account is approved, go to the "Create Event" page, enter details like title, location, date, category, and configure ticket types and prices.', 15],
                ['organizing', 'What is the event review and approval process?', 'After creation, events are reviewed by administration to ensure compliance with our guidelines and to confirm venue reservations before public ticket sales begin.', 16],
                ['organizing', 'How do I withdraw my event earnings after it ends?', 'Ticket revenues are securely held in an escrow vault during the event lifecycle. Net profits are released to your wallet within 24 to 48 hours after the event successfully concludes.', 17],
                ['organizing', 'How do I create a discount promo code for my event?', 'From your event management dashboard, navigate to the "Promo Codes" section to generate a code, define the discount percentage, expiry date, and usage limits.', 18],
                ['organizing', 'What happens if I have to cancel my event?', 'If an event is cancelled by the organizer, the system automatically refunds the full ticket price back to the wallet balances of all registered attendees.', 19],

                // Venues
                ['venues', 'How can I book a venue for my event?', 'While creating an event, you can choose to book a venue directly through the platform by browsing listings and submitting a booking request to the venue owner.', 20],
                ['venues', 'How do venue owners approve booking requests?', 'Venue owners receive notifications on the platform. They can accept, decline, or use the built-in direct chat to clarify details before approval.', 21],
                ['venues', 'Can I add my own property/hall as a venue on the platform?', 'Yes! With a venue owner account, you can list your space by uploading photos, capacities, amenities, location coordinates, and pricing (per hour or day).', 22],

                // Support
                ['support', 'How do I submit a technical support ticket?', 'Go to the "Support" page, choose a category, enter your subject and details, and submit. Our support team will review and reply to your request.', 23],
                ['support', 'Where can I track my previous support requests?', 'At the bottom of the "Support" page, you can see a history of all support tickets you have submitted along with their status and administrative responses.', 24],
                ['support', 'Is there a hotline for urgent balance or refund issues?', 'Yes, you can contact us directly on the hotline +20-1029123440 or email us for urgent resolution of payment concerns.', 25]
            ];

            for (const item of initialFaqs) {
                await pool.execute(
                    'INSERT INTO faqs (category, question, answer, sort_order) VALUES (?, ?, ?, ?)',
                    item
                );
            }
            console.log('Seeded FAQs successfully');
        }

        console.log('FAQs Migration completed successfully!');
    } catch (error) {
        console.error('Error running FAQs migration:', error.message);
        throw error;
    }
}

module.exports = { run: runMigration };
