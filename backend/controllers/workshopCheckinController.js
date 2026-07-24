const pool = require('../config/database');
const logWorkshopActivity = require('../utils/logWorkshopActivity');

exports.checkInBooking = async (req, res) => {
  try {
    const { eventId, workshopMemberId, email, categoryId } = req.workshopMember;
    const { bookingId } = req.body;

    if (!bookingId || !bookingId.trim()) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    const cleanBookingId = bookingId.trim();

    // Look up booking with user details
    const [bookings] = await pool.execute(
      `SELECT b.*, u.full_name, u.email AS user_email, u.username
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = ? LIMIT 1`,
      [cleanBookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid or non-existent Booking ID' });
    }

    const booking = bookings[0];

    // Verify event ownership
    if (booking.event_id !== eventId) {
      return res.status(400).json({ success: false, message: 'This booking is for a different event' });
    }

    // Verify booking status
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This booking has been cancelled' });
    }

    const attendeeName = booking.full_name || booking.username || 'Guest';

    // Check if already checked in
    if (booking.checked_in) {
      // Find staff info who checked them in
      let staffEmail = 'Unknown Staff';
      if (booking.checked_in_by) {
        const [staff] = await pool.execute(
          `SELECT email FROM workshop_members WHERE id = ? LIMIT 1`,
          [booking.checked_in_by]
        );
        if (staff.length > 0) {
          staffEmail = staff[0].email;
        }
      }

      return res.json({
        success: false,
        alreadyCheckedIn: true,
        message: `Already checked in at ${new Date(booking.checked_in_at).toLocaleTimeString()} by ${staffEmail}`,
        attendee: {
          name: attendeeName,
          email: booking.user_email,
          ticketType: booking.ticket_type || 'Standard',
          seatNumber: booking.seat_number,
          seatNumbers: booking.seat_numbers
        }
      });
    }

    // Mark as checked in
    await pool.execute(
      `UPDATE bookings
       SET checked_in = TRUE, checked_in_at = CURRENT_TIMESTAMP, checked_in_by = ?
       WHERE id = ?`,
      [workshopMemberId, cleanBookingId]
    );

    // Log to activity log
    await logWorkshopActivity(
      categoryId,
      workshopMemberId,
      'checkin_scanned',
      `${email} checked in attendee "${attendeeName}" (Booking: #${cleanBookingId.substring(0, 8)})`
    );

    return res.json({
      success: true,
      message: 'Check-in successful!',
      attendee: {
        name: attendeeName,
        email: booking.user_email,
        ticketType: booking.ticket_type || 'Standard',
        seatNumber: booking.seat_number,
        seatNumbers: booking.seat_numbers
      }
    });
  } catch (error) {
    console.error('checkInBooking error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing check-in' });
  }
};

exports.getCheckInSummary = async (req, res) => {
  try {
    const { eventId } = req.workshopMember;

    // Total non-cancelled bookings
    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM bookings WHERE event_id = ? AND status != 'cancelled'`,
      [eventId]
    );
    const totalCount = parseInt(totalRows[0].count, 10) || 0;

    // Checked-in bookings
    const [checkedRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM bookings WHERE event_id = ? AND status != 'cancelled' AND checked_in = TRUE`,
      [eventId]
    );
    const checkedInCount = parseInt(checkedRows[0].count, 10) || 0;

    return res.json({
      success: true,
      checkedInCount,
      totalCount
    });
  } catch (error) {
    console.error('getCheckInSummary error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching check-in summary' });
  }
};
