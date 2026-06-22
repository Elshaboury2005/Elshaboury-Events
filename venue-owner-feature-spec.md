# Feature Spec: Venue Owner Role + Escrow Wallet Booking Flow

## Context

This is an existing Node.js + Express + MySQL event management platform. It already has:
- JWT-based authentication for users
- Admin authentication and admin dashboard with approval workflows for events
- A Wallet system (balance tracking, top-up, withdraw-to-card, transaction history with filters for refunds/payments/top-ups/withdrawals)
- A Notifications system (in-app, admin broadcast, email outbox)
- An Events module with creation, admin approval, cancellation with refund support
- A Venues module (currently admin-created only: venue list, venue creation, venue update, venue analytics, venue availability blocks, venue booking management)

Do NOT rebuild these systems from scratch. Extend and reuse them. Follow the existing code conventions, file structure, and naming patterns already used in `backend/models`, `backend/routes`, `backend/controllers` (or equivalent existing structure — inspect the repo first and match it).

## Goal

Add a new user role called **Venue Owner**, who can independently register on the platform, submit their own venue(s) for listing, and receive paid bookings for those venues through an escrow-style wallet flow. Money is held (frozen) in the venue owner's wallet until the event is completed, and refunded back to the host if the event is cancelled.

---

## 1. New Role: Venue Owner

- Add a `role` (or extend the existing role/type field) on the `users` table with a new value: `venue_owner`.
- Venue Owner registers and logs in through the **exact same auth flow** as a regular user (same `/api/auth/register` and `/api/auth/login` endpoints, same JWT verification, same bcrypt password hashing). The only difference is the `role` value selected at signup (e.g. a toggle on the registration form: "Sign up as Host" vs "Sign up as Venue Owner").
- After registering, a Venue Owner is redirected to a dedicated **Venue Owner Dashboard** (new frontend page), not the regular user profile/event pages.
- Add middleware (similar to existing admin-protected-route middleware) that restricts Venue Owner-only routes (`/api/venue-owner/*`) to authenticated users with `role = venue_owner`.

## 2. Venue Submission Flow (Onboarding)

When a Venue Owner logs in for the first time (or from their dashboard, "Add Venue" button), they fill a full venue profile form:

**Required fields (model this on the existing `venues` table, extend as needed):**
- Venue name
- Description
- Full address, governorate, latitude, longitude (reuse existing fields/logic from the Events module's location fields)
- Capacity (min guests / max guests)
- Base price and pricing model (flat rate per event, or per-hour — pick flat rate for v1 unless existing venue pricing logic says otherwise)
- Deposit / cancellation policy text field
- Amenities/facilities (multi-select or tags: parking, catering kitchen, sound system, etc.)
- Photo gallery (reuse existing image upload logic used elsewhere in the project)
- Contact phone/email
- Available days/time slots (basic calendar availability — reuse existing `Venue availability blocks` logic if present)

On submission, create a `venues` row with:
- `owner_id` → FK to the `users` table (the venue owner who submitted it)
- `status = 'pending_review'`
- `venue_type = 'host_owned'` (distinguish from any existing admin-created/platform-owned venues, since the doc mentions "Platform-booked and host-owned venue types" already exists — reuse that exact distinction if it's already implemented this way)

The venue owner gets a notification confirming submission is under review.

## 3. Admin Approval of Venues

- Add a new section in the Admin Dashboard: **"Pending Venue Submissions"**.
- Admin can view full venue details, and either:
  - **Approve** → `status = 'approved'` → venue becomes visible/selectable to hosts when creating events.
  - **Reject** → `status = 'rejected'`, with a required rejection reason text field, sent to the venue owner via notification.
  - (Optional, nice to have) **Request changes** → `status = 'changes_requested'` with admin comments, venue owner can edit and resubmit.
- Only venues with `status = 'approved'` should ever appear in the public venue browsing pages or in the host's "select a venue" step during event creation.
- Log this approval/rejection action in the existing Admin Audit Logs table.

## 4. Host Selects Venue During Event Creation

- In the existing event creation flow, when the host reaches the venue selection step, only show venues with `status = 'approved'` AND that are available (not already booked/blocked) for the host's selected event date.
- Reuse the existing `Venue availability blocks` logic to filter out unavailable dates.
- When the host selects a venue and date and proceeds, this does **not** immediately confirm the booking — it creates a **Venue Booking Request** in a `pending` state.

## 5. Event Admin Approval (existing flow — confirm ordering)

- The platform already has an event approval workflow (events need admin approval before being publicly listed). Confirm that the Venue Booking Request to the venue owner is only sent out, and payment is only processed, **after** the parent Event has been approved by the admin. If the event creation flow currently sends venue requests before admin approval, change this so:
  1. Host creates event + selects venue + date → Event status = `pending_admin_approval`, Venue Booking Request status = `awaiting_event_approval`.
  2. Admin approves the Event → triggers the Venue Booking Request to actually be sent to the Venue Owner (status changes to `pending_venue_response`) and notifies the venue owner.
  3. If the admin rejects the event, the Venue Booking Request is cancelled automatically, no notification is sent to the venue owner, and no charge happens.

## 6. Venue Owner Accepts/Declines the Request

- Venue Owner Dashboard shows incoming **Booking Requests** with: event date/time, requested by (host name), event type, guest count, any notes.
- Venue Owner can **Accept** or **Decline**.
- Add an auto-expire rule: if the venue owner doesn't respond within a configurable window (e.g. 48 hours), automatically mark the request as `declined_auto_expired` and notify the host to choose another venue. Make this window a config value, not hardcoded.
- If **Declined** (manually or auto-expired): notify the host, no payment is taken, the venue's calendar slot is released, and the host is prompted to pick a different venue for that event.
- If **Accepted**: status becomes `accepted`, the date/slot is now locked in the venue's availability (so it cannot be double-booked by another host), and the flow proceeds to payment.

## 7. Payment + Escrow Wallet Flow

This is the core requirement — reuse the existing Wallet/Payment infrastructure but extend it to support a **held/frozen** balance state, since right now the wallet only tracks a single available balance.

**Wallet model changes:**
- Add a `frozen_balance` (or equivalent) column to the wallet table, separate from the existing spendable/withdrawable balance. Alternatively, if the existing wallet transaction table already supports a `status` field, add new transaction states: `held`, `released`, `refunded`, alongside the existing ones (refund/payment/top-up/withdrawal).
- When the host pays for the venue portion of the event (reuse the existing payment confirmation flow for events/venues):
  1. Money is deducted from the host (via existing payment flow — card or wallet, whichever the host uses).
  2. A wallet transaction is created on the **venue owner's** wallet with `status = 'held'` for the booking amount. This amount shows in the venue owner's dashboard as "Pending / Held" — NOT withdrawable.
  3. Link this transaction to the specific `venue_booking_id` and `event_id` so it can be traced and reversed later.

## 8. Releasing Funds After Event Completion

- Add a scheduled job (reuse the existing daily scheduler pattern already used for chat cleanup) that runs periodically (e.g. daily) and checks for events whose end date/time has passed and that were not cancelled.
- For each such event with a `held` venue booking transaction:
  - Update the transaction `status` from `held` to `available` (or move the amount from `frozen_balance` to the spendable balance).
  - Notify the venue owner that funds are now available to withdraw.
- (Optional, recommended) Add a small buffer/grace period after the event end time (e.g. 24–48 hours) before auto-releasing, to allow for post-event disputes to be raised. Make this configurable.

## 9. Event Cancellation → Refund Flow

- If the Event (or specifically the venue booking) is cancelled — whether by the host, the venue owner, or the admin — before the funds have been released:
  1. Find the related `held` wallet transaction on the venue owner's wallet for this booking.
  2. Reverse it: deduct the held amount from the venue owner's frozen balance, and credit the same amount back to the **host's wallet** as a refund transaction (reuse the existing refund transaction type already in the wallet transaction history filters).
  3. Release the venue's calendar slot so it becomes bookable again for other hosts.
  4. Notify both the host (refund confirmation) and the venue owner (booking cancelled) via the existing notifications system.
- Define and implement a clear cancellation policy (even if simple for v1): e.g. full refund if cancelled more than X days before the event date, otherwise apply a partial refund per the venue's stated cancellation policy text. If you want to keep v1 simple, implement **full refund always** for now, but structure the code so a policy engine can be added later without a rewrite.

## 10. Venue Owner Dashboard (new frontend pages)

Build a dedicated dashboard area for the Venue Owner role, separate from the regular user/admin dashboards, containing:
- **My Venues** — list of submitted venues with status (pending/approved/rejected), edit option.
- **Booking Requests** — incoming pending requests, accept/decline actions.
- **Upcoming Bookings** — accepted bookings with event date, host info, status.
- **Wallet** — reuse the existing wallet UI/component, but display held balance and available balance separately, plus transaction history filtered to this venue owner.
- **Reviews** — reuse the existing venue review system to show reviews left for their venue(s).
- **Basic analytics** — number of bookings, total earned (released), total pending (held). Reuse existing analytics endpoints/patterns where possible instead of writing new ones.

## 11. Notifications to Add

Using the existing notification system, add these new notification triggers:
- Venue submitted → confirmation to venue owner
- Venue approved/rejected → to venue owner
- New booking request → to venue owner
- Booking accepted/declined → to host
- Booking auto-expired (no response) → to host
- Funds released (available to withdraw) → to venue owner
- Booking cancelled / refund issued → to both host and venue owner

## 12. Edge Cases to Handle

- A venue owner should not be able to reject/edit a venue's core date-bound details (price, cancellation policy) while it has active accepted bookings tied to it without warning, since this affects bookings already in progress.
- If the admin rejects or suspends a venue that already has accepted future bookings, do not silently cancel those bookings — flag them for admin review instead of auto-cancelling, since money may already be held.
- Prevent double-booking: once a request is `accepted`, that venue+date combination must be locked immediately so it cannot show up as available to other hosts, even if their event is still pending admin approval.
- A venue owner must not be able to see or access another venue owner's bookings, wallet, or venue data (enforce ownership checks on every venue-owner route, not just role checks).
- Handle the case where a host's event itself is fully approved and paid for, but later the *event* (not just the venue) gets cancelled by the host or admin — this must trigger the same refund flow described in section 9.

## 13. Suggested Database Changes (adapt to existing schema/naming conventions — inspect the project first)

- `users`: add/extend `role` to support `venue_owner`
- `venues`: add `owner_id`, `status` (`pending_review` / `approved` / `rejected` / `changes_requested` / `suspended`), `venue_type` (if not already distinguishing `platform` vs `host_owned`)
- `venue_bookings` (likely already exists per the docs — extend it): add `status` (`awaiting_event_approval` / `pending_venue_response` / `accepted` / `declined` / `declined_auto_expired` / `completed` / `cancelled`)
- `wallet_transactions`: add `status` (`held` / `available` / `refunded`) and `related_booking_id` if not already linkable

---

## Instruction to the AI coding tool

Inspect the existing codebase structure, naming conventions, existing Venue/Event/Wallet/Notification models and routes before writing any code, and follow the same patterns already used in this project (do not introduce a different ORM, different folder structure, or different auth pattern than what already exists). Where this spec is ambiguous or missing a detail, make a reasonable decision consistent with how the rest of this specific codebase already works, and note any assumptions you made in your response so they can be reviewed.
