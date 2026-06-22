(function () {
  function money(value) {
    return `${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} EGP`;
  }

  function shortDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function loadConfirmation() {
    const raw = localStorage.getItem('venueBookingConfirmation');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function populate(payload) {
    document.getElementById('venueName').textContent = payload.venueName || 'Venue';
    document.getElementById('eventName').textContent = payload.eventName || '-';
    document.getElementById('eventDate').textContent = shortDate(payload.eventDate);
    document.getElementById('totalPaid').textContent = money(payload.totalPaid);
    document.getElementById('transactionId').textContent = payload.transactionId || '-';
    document.getElementById('bookingReferencePill').textContent = `REF ${payload.bookingReference || 'N/A'}`;
    document.getElementById('receiptVenueName').textContent = payload.venueName || '-';
    document.getElementById('receiptGovernorate').textContent = payload.venueGovernorate || '-';
    document.getElementById('receiptVenueFee').textContent = money(payload.venueFee);
    document.getElementById('receiptListingFee').textContent = money(payload.listingFee);
    document.getElementById('receiptTotal').textContent = money(payload.totalPaid);
    document.getElementById('continueEventBtn').href = payload.manageUrl || 'my-events.html';
  }

  function downloadReceipt(payload) {
    const jsPdfApi = window.jspdf?.jsPDF;
    if (!jsPdfApi) {
      window.alert('Receipt generator is unavailable right now.');
      return;
    }

    const doc = new jsPdfApi();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Venue Booking Receipt', 20, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Reference: ${payload.bookingReference || 'N/A'}`, 20, 34);
    doc.text(`Transaction ID: ${payload.transactionId || 'N/A'}`, 20, 41);
    doc.text(`Issued: ${new Date(payload.createdAt || Date.now()).toLocaleString('en-US')}`, 20, 48);

    doc.setDrawColor(200, 220, 228);
    doc.line(20, 54, 190, 54);

    const rows = [
      ['Venue', payload.venueName || '-'],
      ['Governorate', payload.venueGovernorate || '-'],
      ['Event', payload.eventName || '-'],
      ['Event Date', shortDate(payload.eventDate)],
      ['Venue Fee', money(payload.venueFee)],
      ['Listing Fee', money(payload.listingFee)],
      ['Total Paid', money(payload.totalPaid)]
    ];

    let y = 66;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 62, y);
      y += 10;
    });

    doc.save(`venue-booking-${payload.bookingReference || 'receipt'}.pdf`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const payload = loadConfirmation();
    if (!payload) {
      window.location.href = 'my-events.html';
      return;
    }

    populate(payload);
    document.getElementById('downloadReceiptBtn').addEventListener('click', () => downloadReceipt(payload));
  });
})();
