# Project Features and Current Implementation Summary

## Overview

This project is a full-stack event management platform built with a Node.js and Express backend, a MySQL database, and a static HTML, CSS, and JavaScript frontend. It supports public event discovery, authenticated user workflows, organizer tools, venue booking, payments, wallets, notifications, chat, AI-assisted marketing, and an admin dashboard.

## Core Platform

- Express server with REST API routing under `/api`.
- Static frontend hosting from the `frontend` directory.
- MySQL database setup and migration helpers.
- JWT-based authentication for protected user routes.
- Admin authentication and protected admin routes.
- Socket.IO setup for real-time communication.
- Platform access middleware for site lock and maintenance mode.
- Health check endpoint at `/api/health`.

## User Accounts and Authentication

- User registration.
- User login and logout.
- JWT verification.
- Username availability checks.
- Email availability checks.
- Password hashing with bcrypt.
- Auth-aware frontend navigation.
- Guest and logged-in route guards.

## Profile Management

- Profile overview page.
- Personal information updates.
- Profile photo upload and removal.
- Password change flow.
- User review management.
- Notification preference management.
- Account deletion support.

## Event Management

- Public event listing.
- Event details page.
- Event creation flow for organizers.
- Event editing and management.
- Event deletion.
- Organizer-specific "My Events" page.
- Event approval state through admin workflows.
- Event lifecycle status handling for active and expired events.
- Event cancellation with refund support.
- Event seat-map endpoint.
- Standard, special, and VIP seat categories.
- Event location, venue address, governorate, latitude, and longitude fields.
- Registration deadline, age restriction, terms and conditions, and agenda fields.
- Listing fee support.
- Event image support.

## Booking and Tickets

- Event booking creation.
- User booking history.
- Event booking lookup for organizers.
- Seat reservation flow.
- Ticket page with event, seat, and booking details.
- QR code dependency support for tickets.
- Booking cancellation.
- Seat-level cancellation.
- Cancellation preview.
- Ticket check-in by booking or ticket code.
- Ticket check-in history tables.

## Payments

- Payment creation, update, and user payment history.
- Event creation payment confirmation flow.
- Venue booking payment confirmation flow.
- Card-style payment screens for event fees and wallet top-ups.
- Payment status tracking for events and bookings.

## Wallet

- User wallet balance tracking.
- Wallet top-up flow.
- Wallet top-up payment page.
- Wallet transaction history.
- Transaction filters for refunds, payments, top-ups, and withdrawals.
- Wallet payment for bookings.
- Withdraw-to-card flow.
- Withdrawal reference tracking.
- Withdrawal status endpoint.
- Admin review flow for wallet withdrawals.

## Venue Booking

- Public venue browsing.
- Featured venues.
- Venue details.
- Venue suggestions.
- Venue wishlist.
- Venue reviews.
- Venue booking flow.
- Venue booking confirmation page.
- User venue booking history.
- Platform-booked and host-owned venue types.
- Venue availability blocks.
- Admin venue calendar support.
- Venue booking CSV export for admins.

## Favorites and Followers

- Add event to favorites.
- Remove event from favorites.
- Favorite status check.
- Favorite events page.
- Organizer profile page.
- Organizer follow and unfollow support.
- Follower notifications for organizer activity.

## Notifications

- User notification list.
- Mark one notification as read.
- Mark all notifications as read.
- Delete one notification.
- Delete all notifications.
- Admin broadcast notifications.
- Event submission and booking-related notification support.

## Reviews

- Event reviews.
- Venue reviews.
- User review history in profile.
- Review editing.
- Review deletion.
- Average review data available for organizer and venue views.

## Support

- User support ticket creation.
- User support ticket history.
- Admin support ticket list.
- Admin replies to support tickets.
- Mark support tickets as read.
- Delete one or all support tickets.

## Chat

- Event chat routes.
- Real-time Socket.IO chat setup.
- Message retrieval per event.
- Read-status endpoint.
- Event chat access checks.
- Chat lock and unlock controls.
- Daily chat cleanup scheduler.
- Floating event chat frontend script.

## AI and Marketing

- AI chat endpoint.
- Event marketing access endpoint.
- Event marketing setup retrieval and saving.
- Marketing plan generation.
- OpenAI marketing service integration structure.
- AI marketing request flag on events.

## Organizer Analytics and Post-Event Tools

- Event views tracking.
- Last-24-hours event view stats.
- Event revenue trend endpoint.
- Post-event summary endpoint.
- Post-event report export.
- Event vault endpoint.
- Event vault transaction history.
- Event vault withdrawal flow.
- Post-event dashboard page.

## Promo Codes and Waitlist

- Event waitlist join flow.
- Promo code creation.
- Promo code listing.
- Promo code activation.
- Promo code deactivation.
- Promo code deletion.
- Promo code validation during booking.

## Admin Dashboard

- Admin login, logout, and verification.
- Dashboard stats.
- Recent activity.
- Revenue trend chart data.
- User list and user details.
- User status updates.
- User deletion.
- Event list and event details.
- Event update and approval controls.
- Event deletion.
- Venue list and venue creation.
- Venue update.
- Venue analytics.
- Venue availability management.
- Venue booking management.
- Booking management.
- Booking status updates.
- Booking cancellation.
- Revenue reports.
- Revenue CSV export.
- Wallet withdrawal management.
- Admin notifications.
- Support management.
- Site settings.
- Audit logs.

## Frontend Pages

- Home page.
- Sign in page.
- Register page.
- Create event page.
- Book event page.
- Event details page.
- Reserve seat page.
- Pay for event page.
- Accepted event page.
- Ticket page.
- My events page.
- Manage event page.
- Favorite events page.
- Notifications page.
- Profile page.
- Organizer profile page.
- Wallet page.
- Wallet top-up payment page.
- Venue booking confirmation page.
- Post-event dashboard page.
- Event team page.
- Event flow data page.
- Contact form page.
- Support page.

## Admin Frontend Pages

- Admin login.
- Admin dashboard.
- Admin users page.
- Admin events page.
- Admin bookings page.
- Admin venues page.
- Admin reports page.
- Admin notifications page.
- Admin support page.
- Admin settings page.
- Admin wallet withdrawals page.

## Database Areas

- Users.
- Events.
- Venues.
- Venue bookings.
- Venue wishlists.
- Venue reviews.
- Venue availability blocks.
- Bookings.
- Favorites.
- Notifications.
- Event views.
- Followers.
- Payments.
- Wallet transactions.
- Admins and admin sessions.
- Admin audit logs.
- Support tickets.
- Site settings.
- Event reviews.
- Event waitlist.
- Promo codes.
- Event check-ins.
- Booking ticket check-ins.
- Email outbox.
- Event marketing setups.

## Current Bug Fix

- Fixed the event creation failure during payment confirmation.
- The `events` insert query in `backend/models/Event.js` had 48 columns but only 46 SQL placeholders.
- The insert now has 48 placeholders, matching the 48 values passed to MySQL.
- This resolves the `ER_WRONG_VALUE_COUNT_ON_ROW` error when creating an event.

## Validation Performed

- Verified the event insert has 48 columns and 48 placeholders.
- Ran JavaScript syntax validation for `backend/models/Event.js`.
