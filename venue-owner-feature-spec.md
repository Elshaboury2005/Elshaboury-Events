# Feature Spec: Venue Owner Role, Venue Booking Approval, Escrow Wallet, and Direct Chat Flow

## Context

This is an existing Node.js + Express + MySQL event management platform. It already has:
- JWT-based authentication for users.
- Admin authentication and an admin dashboard with event approval workflows.
- A wallet system with balance tracking, top-up, withdraw-to-card, refunds, payments, and transaction history filters.
- A notifications system with in-app notifications, admin broadcast, and email outbox.
- An events module with creation, admin approval, cancellation, and refund support.
- A venues module with venue listings, venue creation/update, analytics, availability blocks, and booking management.
- A chat or messaging feature may already exist; if it does, extend it instead of building a parallel system.

Do not rebuild these systems from scratch. Extend and reuse them. Follow the existing code conventions, file structure, and naming patterns already used in the repository.

## Goal

Add a new **Venue Owner** role and a complete venue-booking lifecycle where:
- Hosts can select a venue during event creation.
- The host pays the venue price, optional venue services, platform fee, and refundable security deposit at final event creation checkout.
- The event is not public until both the admin approves the event and the venue owner accepts the venue booking.
- Direct chat between the host and venue owner is created only after both approvals are complete.
- Venue booking money is transferred to the venue owner's wallet as held/frozen funds, then released only after event completion.
- Platform fees are transferred to the admin/platform wallet after approved events and can be withdrawn by admins at any time.
- Cancellation and rejection flows refund the correct parties according to the rules below.

---

## 1. New Role: Venue Owner

- Add or extend the existing user role/type field to support `venue_owner`.
- Venue owners must register and log in through the same authentication flow as regular users:
  - Same `/api/auth/register` endpoint.
  - Same `/api/auth/login` endpoint.
  - Same JWT verification.
  - Same password hashing.
- The only difference is the selected role at signup, for example:
  - `host`
  - `venue_owner`
- After login, users with `role = 'venue_owner'` must be redirected to a dedicated Venue Owner Dashboard.
- Add middleware similar to the admin route guard for routes under `/api/venue-owner/*`.
- Every venue-owner route must enforce both:
  - Authenticated user has `role = 'venue_owner'`.
  - The requested venue, booking, schedule, wallet, or ticket data belongs to that venue owner.

---

## 2. Venue Profile Creation and Management

Venue owners can create, view, and edit their venue profiles from the Venue Owner Dashboard.

### Required Venue Fields

When creating or editing a venue, the venue owner must provide:
- Venue name.
- Description.
- Full address.
- Governorate/city.
- Latitude and longitude.
- Contact phone.
- Contact email.
- Photo gallery.
- Amenities/facilities, such as parking, catering kitchen, sound system, Wi-Fi, backstage rooms, accessibility support, security, and air conditioning.
- Minimum and maximum guest capacity.
- Total chair capacity.
- Standard chair count.
- Special chair count.
- VIP chair count.
- Base venue rental price.
- Pricing model, using flat event rental price for v1 unless the existing platform already supports hourly pricing.
- Security deposit amount, separate from rental price.
- Deposit terms and damage policy.
- Cancellation policy text.
- Available weekdays.
- Available daily time slots.
- Blocked dates or unavailable periods.
- Optional photographer availability.
- Photographer price if available.
- Any additional venue rules, such as noise limits, decoration restrictions, food restrictions, setup time, cleanup time, or required staff presence.

### Chair Capacity Rules

- The venue owner must manually define chair distribution.
- Do not auto-generate standard/special/VIP seats using random percentages.
- Validate that:
  - `standard_chair_count + special_chair_count + vip_chair_count = total_chair_capacity`.
  - Total chair capacity does not exceed venue max guest capacity unless existing business logic allows it.

### Venue Submission Status

On initial submission, create or update the venue with:
- `owner_id` linked to the venue owner's user ID.
- `status = 'pending_review'`.
- `venue_type = 'owner_managed'` or the closest existing equivalent.

Only approved venues can be selected by hosts.

### Venue Editing Rules

- Venue owners may edit venue details freely while there are no active bookings.
- If the venue has active accepted bookings, changes to date-bound or price-bound fields must not affect existing bookings.
- If the venue owner edits fields such as rental price, security deposit, photographer price, cancellation policy, or capacity while active bookings exist:
  - Existing bookings keep a snapshot of the old terms.
  - Future bookings use the new terms after approval/save.
  - Show a warning before saving.

---

## 3. Admin Venue Approval

Add an Admin Dashboard section named **Pending Venue Submissions**.

Admin can view full submitted venue details and perform:
- **Approve**:
  - Set `venues.status = 'approved'`.
  - Make the venue visible/selectable to hosts.
  - Notify the venue owner.
- **Reject**:
  - Set `venues.status = 'rejected'`.
  - Require a rejection reason.
  - Notify the venue owner with the reason.
- **Request Changes**:
  - Set `venues.status = 'changes_requested'`.
  - Require admin comments.
  - Allow the venue owner to edit and resubmit.

All admin actions must be logged in the existing admin audit log system if available.

Only venues with `status = 'approved'` can appear in:
- Public venue browsing.
- Host event creation venue selection.
- Venue search APIs.

---

## 4. Host Venue Selection During Event Creation

During event creation, the host must see a complete overview of each selectable venue, including:
- Venue name and photos.
- Location.
- Capacity.
- Chair distribution.
- Base rental price.
- Security deposit amount.
- Optional photographer availability and price.
- Amenities.
- Venue rules.
- Available time slots.
- Unavailable/blocked dates.
- Cancellation and deposit policies.
- Owner-provided notes.

When the host selects a venue:
- The exact venue rental price stored on the venue must be used.
- The host cannot manually override the venue price.
- The selected venue details and prices must be snapshotted onto the event/booking record.
- The event creation checkout must include:
  - Venue rental price.
  - Optional photographer price, if selected.
  - Security deposit.
  - Platform fee.

### Availability Validation

Before allowing event creation, validate that the selected venue is available for the selected date and time.

The system must reject event creation if:
- The venue is already booked for the same date/time.
- The venue owner has blocked that date/time.
- The selected date is outside the venue's available schedule.
- The venue is not approved.

The host-facing error should clearly say:
> This venue is not available at the selected time. Please choose another time or another venue.

---

## 5. Event and Venue Booking Approval Lifecycle

The event must not become public until both approvals are complete:
- Admin approves the event.
- Venue owner accepts the venue booking.

### Required Statuses

Use existing statuses where possible. If new statuses are needed, support the following lifecycle:

Event statuses:
- `draft`
- `pending_admin_approval`
- `pending_venue_acceptance`
- `approved`
- `rejected`
- `cancelled`
- `completed`

Venue booking statuses:
- `pending_admin_approval`
- `pending_venue_response`
- `accepted`
- `declined`
- `cancelled`
- `completed`

### Creation Flow

1. Host creates an event and selects a venue.
2. Host pays the required checkout amount.
3. Event is saved as `pending_admin_approval`.
4. Venue booking is saved as `pending_admin_approval`.
5. The event is not public.
6. The venue time slot should be temporarily reserved so another host cannot create a conflicting event while approval is pending.

### Admin Approval First

If the admin approves the event:
- Event status becomes `pending_venue_acceptance`.
- Venue booking status becomes `pending_venue_response`.
- Notify the venue owner about the booking request.

If the admin rejects the event:
- Event status becomes `rejected`.
- Venue booking status becomes `cancelled`.
- Refund the host automatically:
  - Venue rental price.
  - Security deposit.
  - Optional photographer price.
  - Platform fee.
- Release the venue time slot.
- The venue owner's decision no longer matters, even if they had accepted or rejected separately.
- The event must never be shown publicly.

### Venue Owner Approval

The Venue Owner Dashboard must show pending booking requests with:
- Event name.
- Event type/category.
- Event date and time.
- Requested duration.
- Host name and contact details.
- Expected guest count.
- Chair distribution requested or ticket categories.
- Venue price snapshot.
- Security deposit snapshot.
- Optional photographer selection and price.
- Platform approval state.
- Event description and notes.
- Host profile summary.

Venue owner can:
- Accept.
- Decline.

If the venue owner accepts and admin has already approved:
- Venue booking status becomes `accepted`.
- Event status becomes `approved`.
- The event becomes public.
- The venue slot becomes fully locked.
- Host and venue owner can see each other in direct chat.
- Generate the digital agreement PDF.

If the venue owner declines after admin approval:
- Venue booking status becomes `declined`.
- Event remains visible only to the host as `pending_venue_acceptance` or equivalent.
- The event is not public.
- The venue slot is released.
- Host is notified to choose another venue from inside the event details page.
- Host event details page must show a clear section: **Choose a venue before publishing**.
- Host can select another available venue for the same event without recreating all event details.

If the venue owner declines before admin approval:
- Keep the event non-public.
- If admin later approves, keep the event pending until the host selects a different venue.

---

## 6. Direct Chat Between Host and Venue Owner

Create or unlock a direct chat only when:
- Admin has approved the event.
- Venue owner has accepted the venue booking.
- The event has a confirmed venue.

The chat must appear:
- In the host's chat list.
- In the venue owner's chat list.

The chat participants must be:
- Event host.
- Venue owner.

The chat should be linked to:
- `event_id`.
- `venue_id`.
- `venue_booking_id`.

Do not create or expose this chat if:
- Admin rejects the event.
- Venue owner rejects the booking.
- The event is still pending.
- The event has no accepted venue.

If an event is cancelled after chat creation:
- Keep the chat history unless existing platform policy deletes cancelled-event chats.
- Mark the chat as related to a cancelled event.
- Prevent new messages only if existing platform policy requires it.

---

## 7. Payment, Platform Fees, Deposit, and Escrow Flow

Payment occurs at the final event creation step when the host clicks **Create Event**.

### Checkout Amount

The host must pay:
- Venue rental price.
- Optional photographer price, if selected.
- Refundable security deposit.
- Platform fee.

The platform fee must be calculated only from the venue rental price unless admin settings explicitly change this later.

Do not calculate platform fees from:
- Photographer price.
- Security deposit.
- Any other optional venue service.

### Platform Fee Configuration

Admin must be able to configure platform fees from the Admin Dashboard.

Admin can choose:
- Fixed amount.
- Percentage of venue rental price.

Admin can define separate fees for:
- Offline/live events.
- Online events.
- Any other event type supported by the existing platform, if applicable.

The selected fee configuration must be snapshotted on the event payment record at checkout time.

### Payment Holding Rules

After successful host payment:
- Host wallet/card is charged the full checkout amount.
- Venue rental amount is recorded as held/frozen for the venue owner.
- Security deposit is recorded separately as held deposit.
- Optional photographer amount is recorded separately as a service amount.
- Platform fee is held until the event reaches the approved state.

When both admin and venue owner approvals are complete:
- Venue rental amount appears in the venue owner's wallet as `held` or `frozen`.
- The venue owner cannot withdraw it yet.
- Platform fee is credited to the admin/platform wallet and becomes withdrawable immediately.
- Optional photographer amount should follow the agreed venue-service payout flow. For v1, if the photographer is venue-provided, keep it linked to the venue booking and release it with venue funds unless product decides otherwise.

### Venue Owner Held Funds

Venue owner wallet must show:
- Available balance.
- Held/frozen balance.
- Released earnings.
- Pending deposits, if displayed separately.
- Transaction history linked to event and venue booking.

Held venue funds remain frozen until:
- The event finishes.
- Any configured grace period passes.
- No admin dispute/damage hold blocks release.

---

## 8. Admin / Platform Wallet

Add or extend an admin/platform wallet.

This wallet receives:
- Platform fees from events that are approved by admin and accepted by venue owner.

Rules:
- Platform fees are not earned if admin rejects the event.
- If admin rejects the event, platform fee is refunded to the host.
- Once an event is approved and venue owner accepts, platform fees become available in the admin/platform wallet.
- Admin can withdraw platform wallet funds at any time, regardless of whether the event has finished.
- Admin dashboard must show:
  - Total platform fees collected.
  - Available platform wallet balance.
  - Withdrawal history.
  - Related event/payment records.

---

## 9. Event Completion and Venue Owner Fund Release

Add or extend a scheduled job to detect completed events.

When the event end date/time has passed:
- Mark the event as completed using existing platform logic, if available.
- Keep venue rental funds frozen until the release condition is met.

Release venue funds when:
- Event is completed.
- The configurable grace period has passed, if enabled.
- Admin has not placed a damage/dispute hold.

On release:
- Move venue rental amount from held/frozen to available balance in the venue owner's wallet.
- Release optional venue-provided service amounts according to the selected service payout rule.
- Notify the venue owner that funds are now available.

---

## 10. Security Deposit Handling

Venue owners can define a security deposit separately from rental price.

Deposit rules:
- Host pays the deposit at event creation checkout.
- Deposit is not part of venue rental earnings.
- Deposit is not part of platform fee calculation.
- Deposit remains held until after the event.
- Admin decides whether to refund it after the event.

After the event:
- Admin can mark the deposit as refundable.
- Admin can partially or fully withhold the deposit if there are damages.
- If refunded, credit the host wallet.
- If withheld, route the withheld amount according to platform policy:
  - To venue owner wallet.
  - To admin/platform wallet.
  - Or split between both, if such policy is implemented.

For v1, use a simple admin action:
- **Refund full deposit to host**.
- **Release full deposit to venue owner**.
- **Partially refund / partially release**, if partial wallet transactions are already supported.

Every deposit decision must be logged in admin audit logs.

---

## 11. Event Cancellation and Refund Rules

### Admin Rejects Event

If admin rejects the event at any point before public approval:
- Refund the host:
  - Venue rental price.
  - Platform fee.
  - Security deposit.
  - Optional photographer price.
- Cancel the venue booking.
- Release the venue time slot.
- Event remains non-public.

### Host Cancels Event After Approval

If the host cancels an approved event:
- Refund all ticket buyers to their wallets.
- Refund venue rental price to the host wallet.
- Refund security deposit to the host wallet unless admin has already placed a damage/dispute hold.
- Refund optional photographer/service amount to the host wallet unless the cancellation policy says otherwise.
- Do not refund the platform fee to the host.
- Keep the platform fee in the admin/platform wallet.
- Release the venue time slot if the event has not already happened.
- Notify:
  - Host.
  - Venue owner.
  - Ticket buyers.
  - Admins, if existing platform behavior supports this.

### Venue Owner Declines Booking

If venue owner declines the booking:
- Event remains non-public.
- Host is prompted to choose another venue.
- Venue time slot is released.
- No venue-owner payout occurs.
- Do not create host-owner direct chat.
- Payment should remain attached to the event while the host selects a replacement venue if product chooses to keep checkout paid.
- If the host cancels instead of choosing another venue, refund according to the applicable cancellation rules.

### Event Cancelled Before Funds Release

If an event is cancelled before held venue funds are released:
- Reverse the held venue transaction.
- Deduct from venue owner's frozen balance.
- Credit the host wallet according to the cancellation policy.
- Release venue slot if applicable.

---

## 12. Venue Owner Dashboard

Build a dedicated dashboard area for the venue owner role.

### Dashboard Sections

The Venue Owner Dashboard must include:
- **My Venues**
  - List all venues owned by this user.
  - Show approval status.
  - Allow editing venue details.
  - Show public preview of venue details as hosts see them.
- **Booking Requests**
  - Show pending requests.
  - Allow accept/decline.
  - Show event and host details before decision.
- **Venue Schedule**
  - Calendar/table view showing who booked the venue, when, and for how long.
  - Show blocked dates.
  - Show accepted bookings.
  - Show pending reservations.
  - Allow venue owner to block days or time ranges weekly or yearly.
- **Upcoming Bookings**
  - Show accepted bookings.
  - Show event details.
  - Show host details.
  - Show LOC/team details once booking is approved.
- **Seat Tracking**
  - Show chair/ticket booking status per event.
  - Show how many standard, special, and VIP seats are booked.
  - Show remaining seats.
- **My Tickets**
  - If the venue owner books a seat for an event, show their attendee ticket inside the Venue Owner Dashboard.
  - The venue owner can book a seat like any normal attendee if tickets are available.
- **Wallet**
  - Show available balance.
  - Show held/frozen balance.
  - Show pending deposit-related amounts if applicable.
  - Show transaction history.
- **Reviews**
  - Reuse existing venue review functionality.
- **Analytics**
  - Total bookings.
  - Upcoming bookings.
  - Completed bookings.
  - Released earnings.
  - Held earnings.
  - Occupancy / utilization rate.
- **Notifications**
  - Send notifications to a specific host.
  - Send announcements to all hosts who booked this venue.
  - View notification history.

---

## 13. Venue Schedule, Availability, and Blocking

Venue owners must be able to manage availability from their dashboard.

Supported availability controls:
- Weekly recurring available days.
- Weekly recurring blocked days.
- Specific blocked calendar dates.
- Date ranges, such as vacation or maintenance.
- Time slots per day.
- Full-day closure.

Host selection validation must use these availability rules.

If a host selects a blocked or booked time:
- Reject the selection during event creation.
- Show a clear error explaining that the venue is unavailable.

The venue timeline/calendar must show:
- Pending reservations.
- Accepted bookings.
- Completed bookings.
- Cancelled bookings.
- Owner-created blocked periods.

Prevent double-booking at database level where possible using transaction-safe checks or locking.

---

## 14. Seat and Ticket Tracking for Venue Owners

For each approved event in their venue, the venue owner can view:
- Total venue chair capacity.
- Total tickets/seats created for the event.
- Booked standard seats.
- Booked special seats.
- Booked VIP seats.
- Remaining seats by category.
- Attendee count if allowed by privacy policy.

Venue owners may purchase/book tickets like any attendee:
- Use the existing ticket booking flow.
- Issue a normal attendee ticket.
- Display that ticket inside the Venue Owner Dashboard because the account role is `venue_owner`.

Venue owner access to attendee data must follow existing privacy/security rules.

---

## 15. Venue Owner Notifications to Hosts

Venue owners need a notification tool inside their dashboard.

They can send:
- A notification to one specific host who has a booking/request for their venue.
- A notification to all hosts with bookings for one selected venue.
- A notification to hosts for one selected event date/range, if supported.

Restrictions:
- Venue owners cannot notify unrelated hosts.
- Venue owners cannot broadcast to all platform users.
- Notification content must be stored in existing notification history.
- Admin should be able to review abusive notification usage if audit tools exist.

---

## 16. Digital Contract / Agreement PDF

After both approvals are complete:
- Admin has approved the event.
- Venue owner has accepted the booking.

Generate a PDF agreement automatically.

The PDF must include:
- Event details.
- Host details.
- Venue owner details.
- Venue details.
- Event date and time.
- Booking duration.
- Venue rental price.
- Security deposit amount.
- Optional photographer/service details and price.
- Platform fee summary.
- Cancellation policy.
- Deposit/damage policy.
- Venue rules.
- Timestamp of host payment/confirmation.
- Timestamp of admin approval.
- Timestamp of venue owner acceptance.
- Electronic acceptance signatures or equivalent system-generated acceptance records.

Store the agreement PDF and link it to:
- `event_id`.
- `venue_id`.
- `venue_booking_id`.
- Host user ID.
- Venue owner user ID.

The host and venue owner must be able to download/view the PDF from their dashboards.

Admin must be able to view it from the event/booking admin details page.

---

## 17. Notifications to Add

Use the existing notification system for:
- Venue submitted to admin review.
- Venue approved.
- Venue rejected.
- Venue changes requested.
- Event created and payment received.
- Admin approved event and venue request sent to venue owner.
- Admin rejected event and refund issued.
- New booking request sent to venue owner.
- Venue owner accepted booking.
- Venue owner declined booking.
- Host must choose another venue.
- Event fully approved and now public.
- Direct chat created/unlocked.
- Agreement PDF generated.
- Funds moved to venue owner held balance.
- Venue funds released after completion.
- Deposit refunded to host.
- Deposit released/withheld after admin decision.
- Event cancelled and ticket refunds issued.
- Venue owner announcement sent to host(s).

---

## 18. Suggested Database Changes

Adapt names and types to the existing schema.

### `users`

- Add or extend `role` to support:
  - `host`
  - `venue_owner`
  - `admin`

### `venues`

Add if missing:
- `owner_id`
- `status`
- `venue_type`
- `base_price`
- `security_deposit_amount`
- `deposit_policy`
- `cancellation_policy`
- `total_chair_capacity`
- `standard_chair_count`
- `special_chair_count`
- `vip_chair_count`
- `has_photographer`
- `photographer_price`
- `rules`
- `amenities`

### `venue_availability`

Use or extend existing availability tables for:
- Weekly available days.
- Time slots.
- Blocked dates.
- Blocked date ranges.
- Owner-created closures.

### `venue_bookings`

Add or extend:
- `event_id`
- `venue_id`
- `host_id`
- `venue_owner_id`
- `status`
- `start_datetime`
- `end_datetime`
- `duration_minutes`
- `venue_price_snapshot`
- `security_deposit_snapshot`
- `photographer_selected`
- `photographer_price_snapshot`
- `platform_fee_snapshot`
- `admin_approved_at`
- `venue_owner_accepted_at`
- `venue_owner_declined_at`
- `decline_reason`

### `wallets`

Add or extend:
- `available_balance`
- `frozen_balance`
- `wallet_type`, if needed for admin/platform wallet separation.

### `wallet_transactions`

Add or extend:
- `status`
- `type`
- `amount`
- `from_wallet_id`
- `to_wallet_id`
- `event_id`
- `venue_id`
- `venue_booking_id`
- `related_ticket_id`
- `metadata`

Suggested transaction statuses:
- `pending`
- `held`
- `available`
- `released`
- `refunded`
- `cancelled`

Suggested transaction types:
- `venue_rental_payment`
- `platform_fee`
- `security_deposit_hold`
- `security_deposit_refund`
- `security_deposit_release`
- `photographer_service_payment`
- `ticket_refund`
- `event_refund`
- `withdrawal`

### `direct_chats` or Existing Chat Tables

Add or link:
- `event_id`
- `venue_id`
- `venue_booking_id`
- `host_id`
- `venue_owner_id`
- `status`

### `event_agreements`

Create if needed:
- `id`
- `event_id`
- `venue_id`
- `venue_booking_id`
- `host_id`
- `venue_owner_id`
- `pdf_url` or file path
- `host_accepted_at`
- `admin_approved_at`
- `venue_owner_accepted_at`
- `created_at`

---

## 19. Edge Cases and Business Rules

- Event must not be public unless admin approval and venue owner acceptance are both complete.
- If admin rejects an event, all host checkout money must be refunded, including platform fee.
- If host cancels an approved event, ticket buyers are refunded, venue money is refunded to host, but platform fee is not refunded.
- If venue owner rejects while admin approved, event stays pending for the host to select a replacement venue.
- Hosts must not be able to book an already reserved or blocked venue slot.
- Venue owners must not access other owners' venues, bookings, schedules, chats, wallets, or notifications.
- Platform fees must be calculated from venue rental price only, not deposits or optional services.
- Security deposit must be separate from venue rental income.
- Admin must decide whether to refund or release the security deposit after the event.
- Digital agreement PDF must only be generated after full approval.
- Direct chat must only be created/unlocked after full approval.
- Existing bookings must preserve price and policy snapshots even if the venue owner edits the venue later.
- If an approved venue is later suspended while future bookings exist, do not silently cancel those bookings; flag them for admin review.

---

## 20. Implementation Guidance for the AI Coding Tool

Before writing code:
- Inspect the existing backend models, controllers, routes, migrations, and frontend pages.
- Reuse existing auth, wallet, notification, event approval, venue availability, payment, ticket, and chat patterns.
- Do not introduce a new ORM, new routing pattern, or unrelated folder structure.
- Prefer extending existing tables and APIs where clean.
- Add migrations carefully and keep backwards compatibility with existing data.
- Add ownership checks to every venue-owner endpoint.
- Use transaction-safe payment and booking updates so money and booking statuses cannot become inconsistent.
- Add tests for approval, rejection, refund, double-booking, platform fee, deposit, and chat creation flows if the repository already has a test setup.

Where existing implementation details conflict with this spec, follow the existing architecture and document the assumption in the final implementation notes.
