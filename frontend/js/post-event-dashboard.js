const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';
const params = new URLSearchParams(window.location.search);
const eventId = params.get('id');

const state = {
  summary: null,
  barView: 'bookings',
  vaultData: null,
  vaultLoading: false
};

function getAuthToken() {
  return localStorage.getItem('token');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return `${Number(value || 0).toLocaleString()} EGP`;
}

function moneyPrecise(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

function toShortDateTime(value) {
  if (!value) return 'TBA';
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'TBA';
  const datePart = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${datePart} \u00B7 ${timePart}`;
}

function toDayLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function toShortNumber(value) {
  return Number(value || 0).toLocaleString();
}

function getAttendanceClass(rate) {
  const value = Number(rate || 0);
  if (value > 70) return 'rate-high';
  if (value >= 30) return 'rate-medium';
  return 'rate-low';
}

function renderStars(value) {
  const score = Math.max(0, Math.min(5, Number(value || 0)));
  const rounded = Math.round(score);
  return `${'\u2605'.repeat(rounded)}${'\u2606'.repeat(5 - rounded)}`;
}

function animateValue(element, target, formatter, duration = 900) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const current = target * progress;
    element.textContent = formatter(current, progress >= 1);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderStats(summary) {
  const statsGrid = document.getElementById('statsGrid');
  const cancellationCount = Number(summary.cancellations?.count || 0);
  const avgRating = Number(summary.ratings?.avg || 0);
  const attendanceRate = Number(summary.seats?.attendanceRate || 0);
  const attendanceClass = getAttendanceClass(attendanceRate);
  const revenueFromVault = state.vaultData?.vault
    ? Math.max(
      0,
      Number(state.vaultData.vault.totalCollected || 0) - Number(state.vaultData.vault.totalRefunded || 0)
    )
    : NaN;
  const totalRevenue = Number.isFinite(revenueFromVault)
    ? revenueFromVault
    : Number(summary.revenue?.total || 0);

  statsGrid.innerHTML = `
    <article class="stat-card">
      <div class="stat-head"><span>&#128101;</span><span>Confirmed Attendees</span></div>
      <div class="stat-value count-up" data-type="number" data-target="${Number(summary.seats?.confirmedAttendees || 0)}">0</div>
    </article>
    <article class="stat-card">
      <div class="stat-head"><span>&#9989;</span><span>Total Attended</span></div>
      <div class="stat-value count-up" data-type="number" data-target="${Number(summary.seats?.attendedCount || 0)}">0</div>
    </article>
    <article class="stat-card ${attendanceClass}">
      <div class="stat-head"><span>&#128202;</span><span>Attendance Rate</span></div>
      <div class="stat-value count-up" data-type="percent" data-target="${attendanceRate}">0%</div>
    </article>
    <article class="stat-card revenue-card">
      <div class="stat-head"><span>&#128176;</span><span>Total Revenue</span></div>
      <div class="stat-value count-up" data-type="currency" data-target="${totalRevenue}">0 EGP</div>
    </article>
    <article class="stat-card">
      <div class="stat-head"><span>&#10060;</span><span>Total Cancellations</span></div>
      <div class="stat-value count-up" data-type="number" data-target="${cancellationCount}">0</div>
    </article>
    <article class="stat-card rating-card">
      <div class="stat-head"><span>&#11088;</span><span>Average Rating</span></div>
      <div class="stat-value count-up" data-type="rating" data-target="${avgRating}">0.0</div>
      <div class="stars-inline">${renderStars(avgRating)}</div>
    </article>
  `;

  statsGrid.querySelectorAll('.count-up').forEach((el) => {
    const target = Number(el.getAttribute('data-target') || 0);
    const type = el.getAttribute('data-type');
    if (type === 'currency') {
      animateValue(el, target, (value, done) => (done ? money(target) : `${Math.round(value).toLocaleString()} EGP`));
      return;
    }
    if (type === 'percent') {
      animateValue(el, target, (value, done) => `${(done ? target : value).toFixed(1)}%`);
      return;
    }
    if (type === 'rating') {
      animateValue(el, target, (value, done) => `${(done ? target : value).toFixed(1)}`);
      return;
    }
    animateValue(el, target, (value, done) => (done ? Math.round(target).toLocaleString() : Math.round(value).toLocaleString()));
  });
}

function renderBreakdown(summary) {
  const byType = summary.seats?.byType || {};
  const revenueByType = summary.revenue?.byType || {};
  const rows = [
    { key: 'standard', label: 'Standard', className: 'type-standard' },
    { key: 'special', label: 'Special', className: 'type-special' },
    { key: 'vip', label: 'VIP', className: 'type-vip' }
  ];

  let totalBooked = 0;
  let totalEmpty = 0;
  let totalRevenue = 0;
  let totalCapacity = 0;
  const authoritativeTotalRevenue = Number(summary.revenue?.total || 0);

  const body = document.getElementById('breakdownBody');
  const rowHtml = rows.map((row) => {
    const booked = Number(byType[row.key]?.booked || 0);
    const empty = Number(byType[row.key]?.empty || 0);
    const capacity = Number(byType[row.key]?.capacity || (booked + empty));
    const revenue = Number(revenueByType[row.key] || 0);
    const fillRate = capacity > 0 ? (booked / capacity) * 100 : 0;
    totalBooked += booked;
    totalEmpty += empty;
    totalRevenue += revenue;
    totalCapacity += capacity;

    return `
      <tr class="${row.className}">
        <td><span class="type-pill">${row.label}</span></td>
        <td>${toShortNumber(booked)}</td>
        <td>${toShortNumber(empty)}</td>
        <td>${money(revenue)}</td>
        <td>
          <div class="mini-progress"><span style="width:${Math.min(100, fillRate)}%"></span></div>
          <span class="mini-progress-label">${fillRate.toFixed(1)}%</span>
        </td>
      </tr>
    `;
  }).join('');

  const totalFillRate = totalCapacity > 0 ? (totalBooked / totalCapacity) * 100 : 0;
  body.innerHTML = `
    ${rowHtml}
    <tr class="totals-row">
      <td>Total</td>
      <td>${toShortNumber(totalBooked)}</td>
      <td>${toShortNumber(totalEmpty)}</td>
      <td>${money(authoritativeTotalRevenue > 0 ? authoritativeTotalRevenue : totalRevenue)}</td>
      <td>
        <div class="mini-progress"><span style="width:${Math.min(100, totalFillRate)}%"></span></div>
        <span class="mini-progress-label">${totalFillRate.toFixed(1)}%</span>
      </td>
    </tr>
  `;
}

function setupCanvas(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(300, canvas.clientWidth || canvas.parentElement?.clientWidth || 600);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function formatAxisNumber(value) {
  const num = Number(value || 0);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return `${Math.round(num)}`;
}

function drawBarChart(canvas, labels, values, options = {}) {
  const { ctx, width, height } = setupCanvas(canvas, options.height || 360);
  const chartLeft = 58;
  const chartRight = width - 24;
  const chartTop = 42;
  const chartBottom = height - 58;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const maxValue = Math.max(...values, 1);
  const gridLines = 5;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#d9e9ef';
  ctx.font = '700 14px Inter';
  ctx.fillText(options.title || 'Distribution', chartLeft, 22);

  for (let i = 0; i <= gridLines; i += 1) {
    const y = chartTop + (i * chartHeight / gridLines);
    const value = maxValue - (i * maxValue / gridLines);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();
    ctx.fillStyle = '#9fb7be';
    ctx.font = '11px Inter';
    ctx.fillText(formatAxisNumber(value), 8, y + 4);
  }

  const barArea = chartWidth / labels.length;
  const barWidth = Math.min(72, barArea * 0.62);
  const palette = ['#ff7a18', '#ff4d6d', '#f59e0b'];

  values.forEach((value, index) => {
    const x = chartLeft + (index * barArea) + (barArea - barWidth) / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = chartBottom - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, chartBottom);
    gradient.addColorStop(0, palette[index % palette.length]);
    gradient.addColorStop(1, '#f97316');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#f3f8fa';
    ctx.font = '600 11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(formatAxisNumber(value), x + barWidth / 2, y - 8);
    ctx.fillStyle = '#c9dbe0';
    ctx.fillText(labels[index], x + barWidth / 2, chartBottom + 18);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#95aeb6';
  ctx.font = '11px Inter';
  ctx.fillText(options.yLabel || 'Value', chartLeft, chartTop - 12);
  ctx.fillText(options.xLabel || 'Ticket Type', chartRight - 70, height - 14);
}

function drawDonutChart(canvas, labels, values, options = {}) {
  const { ctx, width, height } = setupCanvas(canvas, options.height || 330);
  const cx = width * 0.34;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.27;
  const innerRadius = radius * 0.58;
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  const colors = ['#ff7a18', '#ff4d6d', '#f59e0b', '#60a5fa', '#34d399'];
  let startAngle = -Math.PI / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#d9e9ef';
  ctx.font = '700 14px Inter';
  ctx.fillText(options.title || 'Distribution', 20, 24);

  if (total <= 0) {
    ctx.fillStyle = '#9fb7be';
    ctx.font = '13px Inter';
    ctx.fillText('No data available', 20, height / 2);
    return;
  }

  values.forEach((rawValue, index) => {
    const value = Number(rawValue || 0);
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.fillStyle = colors[index % colors.length];
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fill();
    startAngle += angle;
  });

  ctx.beginPath();
  ctx.fillStyle = '#0f2b33';
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f3f8fa';
  ctx.textAlign = 'center';
  ctx.font = '700 16px Inter';
  ctx.fillText(options.centerLabel || 'Total', cx, cy - 4);
  ctx.font = '700 14px Inter';
  ctx.fillText(formatAxisNumber(total), cx, cy + 16);
  ctx.textAlign = 'left';

  const legendX = width * 0.62;
  let legendY = 56;
  labels.forEach((label, index) => {
    const value = Number(values[index] || 0);
    const ratio = total > 0 ? (value / total) * 100 : 0;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(legendX, legendY - 9, 12, 12);
    ctx.fillStyle = '#d7e7ec';
    ctx.font = '12px Inter';
    ctx.fillText(`${label}: ${formatAxisNumber(value)} (${ratio.toFixed(1)}%)`, legendX + 18, legendY + 1);
    legendY += 24;
  });
}

function buildTimelineRange(summary) {
  const timeline = Array.isArray(summary.timeline) ? summary.timeline : [];
  const map = new Map();
  timeline.forEach((point) => {
    const day = String(point.day || '').slice(0, 10);
    if (!day) return;
    map.set(day, {
      bookings: Number(point.bookings || 0),
      revenue: Number(point.revenue || 0)
    });
  });

  const startRaw = summary.event?.created_at || timeline[0]?.day || summary.event?.event_date;
  const endRaw = summary.event?.event_date || timeline[timeline.length - 1]?.day || startRaw;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return timeline.map((point) => ({
      day: String(point.day || '').slice(0, 10),
      bookings: Number(point.bookings || 0),
      revenue: Number(point.revenue || 0)
    }));
  }

  const list = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const existing = map.get(day) || { bookings: 0, revenue: 0 };
    list.push({ day, bookings: Number(existing.bookings || 0), revenue: Number(existing.revenue || 0) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return list;
}

function drawTimelineChart(canvas, summary) {
  const points = buildTimelineRange(summary);
  const { ctx, width, height } = setupCanvas(canvas, 360);
  const margin = { top: 38, right: 62, bottom: 52, left: 52 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxBookings = Math.max(...points.map((p) => Number(p.bookings || 0)), 1);
  const maxRevenue = Math.max(...points.map((p) => Number(p.revenue || 0)), 1);
  const steps = 5;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#d9e9ef';
  ctx.font = '700 14px Inter';
  ctx.fillText('Bookings & Revenue by Day', margin.left, 22);

  for (let i = 0; i <= steps; i += 1) {
    const y = margin.top + ((chartHeight / steps) * i);
    const leftValue = maxBookings - ((maxBookings / steps) * i);
    const rightValue = maxRevenue - ((maxRevenue / steps) * i);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    ctx.fillStyle = '#9fb7be';
    ctx.font = '11px Inter';
    ctx.fillText(formatAxisNumber(leftValue), 8, y + 4);
    ctx.fillText(formatAxisNumber(rightValue), width - margin.right + 10, y + 4);
  }

  if (points.length <= 0) return;
  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth;

  function plotLine(key, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = margin.left + (xStep * index);
      const denominator = key === 'bookings' ? maxBookings : maxRevenue;
      const value = Number(point[key] || 0);
      const y = margin.top + chartHeight - ((value / denominator) * chartHeight);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    points.forEach((point, index) => {
      const x = margin.left + (xStep * index);
      const denominator = key === 'bookings' ? maxBookings : maxRevenue;
      const value = Number(point[key] || 0);
      const y = margin.top + chartHeight - ((value / denominator) * chartHeight);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  plotLine('bookings', '#ff7a18');
  plotLine('revenue', '#34d399');

  const tickCount = Math.min(points.length, 6);
  const interval = Math.max(1, Math.floor(points.length / tickCount));
  ctx.fillStyle = '#a8c1c8';
  ctx.font = '11px Inter';
  ctx.textAlign = 'center';
  points.forEach((point, index) => {
    if (index % interval !== 0 && index !== points.length - 1) return;
    const x = margin.left + (xStep * index);
    ctx.fillText(toDayLabel(point.day), x, height - 16);
  });
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ffb16b';
  ctx.fillRect(margin.left, height - 34, 10, 10);
  ctx.fillStyle = '#d9e9ef';
  ctx.fillText('Bookings', margin.left + 14, height - 26);
  ctx.fillStyle = '#7ee2b6';
  ctx.fillRect(margin.left + 90, height - 34, 10, 10);
  ctx.fillStyle = '#d9e9ef';
  ctx.fillText('Revenue', margin.left + 104, height - 26);
}

function drawHorizontalBarChart(canvas, data, options = {}) {
  const bars = Array.isArray(data) ? data.filter((item) => Number(item.value || 0) > 0) : [];
  const barCount = Math.min(bars.length, 10);
  const chartHeight = Math.max(280, 70 + (barCount * 34));
  const { ctx, width, height } = setupCanvas(canvas, chartHeight);
  const margin = { top: 42, right: 20, bottom: 26, left: 136 };
  const chartWidth = width - margin.left - margin.right;
  const maxValue = Math.max(...bars.map((item) => Number(item.value || 0)), 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#d9e9ef';
  ctx.font = '700 14px Inter';
  ctx.fillText(options.title || 'Demographics', 16, 22);

  if (barCount === 0) {
    ctx.fillStyle = '#9fb7be';
    ctx.font = '13px Inter';
    ctx.fillText('No data available', 16, height / 2);
    return false;
  }

  bars.slice(0, barCount).forEach((item, index) => {
    const y = margin.top + (index * 32);
    const value = Number(item.value || 0);
    const barLength = (value / maxValue) * chartWidth;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(margin.left, y, chartWidth, 18);
    ctx.fillStyle = '#ff7a18';
    ctx.fillRect(margin.left, y, barLength, 18);
    ctx.fillStyle = '#d9e9ef';
    ctx.font = '11px Inter';
    const label = String(item.label || 'Unknown');
    const clipped = label.length > 18 ? `${label.slice(0, 18)}...` : label;
    ctx.fillText(clipped, 10, y + 13);
    ctx.fillText(String(value), margin.left + barLength + 8, y + 13);
  });

  return true;
}

function renderDistributionCharts(summary) {
  const labels = ['Standard', 'Special', 'VIP'];
  const bookedValues = [
    Number(summary.seats?.byType?.standard?.booked || 0),
    Number(summary.seats?.byType?.special?.booked || 0),
    Number(summary.seats?.byType?.vip?.booked || 0)
  ];
  const revenueValues = [
    Number(summary.revenue?.byType?.standard || 0),
    Number(summary.revenue?.byType?.special || 0),
    Number(summary.revenue?.byType?.vip || 0)
  ];
  const chartValues = state.barView === 'revenue' ? revenueValues : bookedValues;
  drawBarChart(
    document.getElementById('distributionChart'),
    labels,
    chartValues,
    {
      title: state.barView === 'revenue' ? 'Revenue Distribution by Ticket Type' : 'Bookings Count by Ticket Type',
      yLabel: state.barView === 'revenue' ? 'Revenue (EGP)' : 'Booked Seats',
      xLabel: 'Ticket Types'
    }
  );

  drawDonutChart(
    document.getElementById('revenueDonutChart'),
    labels,
    revenueValues,
    {
      title: 'Revenue Share',
      centerLabel: 'Revenue'
    }
  );

  drawTimelineChart(document.getElementById('timelineChart'), summary);
}

function renderDemographics(summary) {
  const governorateData = Array.isArray(summary.demographics?.byGovernorate) ? summary.demographics.byGovernorate : [];
  const genderData = Array.isArray(summary.demographics?.byGender) ? summary.demographics.byGender : [];

  const hasGovernorate = drawHorizontalBarChart(
    document.getElementById('governorateChart'),
    governorateData,
    { title: 'Attendees by Governorate' }
  );
  document.getElementById('demographicsEmpty').hidden = hasGovernorate;

  const genderLabels = genderData.map((item) => item.label);
  const genderValues = genderData.map((item) => Number(item.value || 0));
  drawDonutChart(
    document.getElementById('genderChart'),
    genderLabels.length ? genderLabels : ['No Data'],
    genderValues.length ? genderValues : [0],
    {
      title: 'Gender Split',
      centerLabel: 'Attendees'
    }
  );
}

function renderCancellations(summary) {
  const cancellations = summary.cancellations || {};
  document.getElementById('cancelCount').textContent = toShortNumber(cancellations.count || 0);
  document.getElementById('refundTotal').textContent = money(cancellations.refundedAmount || 0);
  document.getElementById('cancelRate').textContent = `${Number(cancellations.cancellationRate || 0).toFixed(1)}%`;

  const reasons = Array.isArray(cancellations.reasons) ? cancellations.reasons : [];
  const list = document.getElementById('cancelReasonsList');
  if (!reasons.length) {
    list.innerHTML = '<li>No cancellation reason data recorded.</li>';
    return;
  }

  list.innerHTML = reasons.map((item) => (
    `<li><span>${escapeHtml(item.label)}</span><strong>${toShortNumber(item.count || 0)}</strong></li>`
  )).join('');
}

function renderReviews(summary) {
  const ratings = summary.ratings || {};
  const avg = Number(ratings.avg || 0);
  const count = Number(ratings.count || 0);
  const distribution = ratings.distribution || {};
  const reviews = Array.isArray(summary.reviews) ? summary.reviews : [];

  document.getElementById('ratingSummary').textContent = `Average: ${avg.toFixed(1)} / 5 (${count} reviews)`;
  document.getElementById('avgRatingNumber').textContent = avg.toFixed(1);
  document.getElementById('avgRatingStars').textContent = renderStars(avg);
  document.getElementById('ratingCountNote').textContent = `${count} submitted review${count === 1 ? '' : 's'}`;

  const maxBucket = Math.max(
    Number(distribution['5'] || 0),
    Number(distribution['4'] || 0),
    Number(distribution['3'] || 0),
    Number(distribution['2'] || 0),
    Number(distribution['1'] || 0),
    1
  );

  document.getElementById('ratingDistribution').innerHTML = [5, 4, 3, 2, 1].map((star) => {
    const bucket = Number(distribution[String(star)] || distribution[star] || 0);
    const width = (bucket / maxBucket) * 100;
    return `
      <div class="rating-row">
        <span>${star}&#9733;</span>
        <div class="rating-bar"><span style="width:${width}%"></span></div>
        <strong>${bucket}</strong>
      </div>
    `;
  }).join('');

  const reviewsList = document.getElementById('reviewsList');
  if (!reviews.length) {
    reviewsList.innerHTML = '<p class="empty-note">No reviews yet.</p>';
    return;
  }

  reviewsList.innerHTML = reviews.map((review) => {
    const name = review.full_name || review.username || 'User';
    const initial = String(name).trim().charAt(0).toUpperCase() || 'U';
    const stars = renderStars(Number(review.rating || 0));
    const date = toShortDateTime(review.created_at);
    return `
      <article class="review-card">
        <div class="review-head">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div>
            <p class="reviewer-name">${escapeHtml(name)}</p>
            <p class="review-date">${escapeHtml(date)}</p>
          </div>
        </div>
        <p class="review-stars">${stars}</p>
        <p class="review-text">${escapeHtml(review.review || 'No written comment provided.')}</p>
      </article>
    `;
  }).join('');
}

function renderHeader(summary) {
  const event = summary.event || {};
  document.getElementById('eventTitle').textContent = event.title || 'Post-Event Dashboard';
  document.getElementById('eventMeta').textContent = `${toShortDateTime(event.event_date)} \u00B7 ${event.location || 'TBA'}`;
}

function isEventEnded(summary) {
  const lifecycle = String(summary?.event?.lifecycle_status || '').trim().toLowerCase();
  const eventDate = new Date(summary?.event?.event_date);
  return lifecycle === 'expired' || (!isNaN(eventDate.getTime()) && eventDate.getTime() <= Date.now());
}

function buildVaultTimelinePoints(transactions) {
  const sorted = (Array.isArray(transactions) ? [...transactions] : [])
    .sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  const byDay = new Map();
  sorted.forEach((tx) => {
    const day = String(tx.createdAt || '').slice(0, 10);
    if (!day) return;
    byDay.set(day, Number(tx.balanceAfter || 0));
  });

  return Array.from(byDay.entries()).map(([day, balance]) => ({ day, balance }));
}

function drawVaultTimelineChart(canvas, transactions) {
  const points = buildVaultTimelinePoints(transactions);
  const { ctx, width, height } = setupCanvas(canvas, 320);
  ctx.clearRect(0, 0, width, height);

  if (points.length === 0) {
    ctx.fillStyle = '#9fb7be';
    ctx.font = '13px Inter';
    ctx.fillText('No vault transaction data available', 16, height / 2);
    return false;
  }

  const margin = { top: 36, right: 22, bottom: 46, left: 52 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxBalance = Math.max(...points.map((p) => Number(p.balance || 0)), 1);
  const steps = 5;

  ctx.fillStyle = '#d9e9ef';
  ctx.font = '700 14px Inter';
  ctx.fillText('Vault Balance Trend', margin.left, 22);

  for (let i = 0; i <= steps; i += 1) {
    const y = margin.top + ((chartHeight / steps) * i);
    const value = maxBalance - ((maxBalance / steps) * i);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    ctx.fillStyle = '#9fb7be';
    ctx.font = '11px Inter';
    ctx.fillText(formatAxisNumber(value), 10, y + 4);
  }

  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth;
  const linePoints = points.map((point, index) => {
    const x = margin.left + (xStep * index);
    const y = margin.top + chartHeight - ((Number(point.balance || 0) / maxBalance) * chartHeight);
    return { x, y, day: point.day, balance: Number(point.balance || 0) };
  });

  const areaGradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
  areaGradient.addColorStop(0, 'rgba(255, 122, 24, 0.32)');
  areaGradient.addColorStop(1, 'rgba(255, 122, 24, 0.02)');
  ctx.fillStyle = areaGradient;
  ctx.beginPath();
  linePoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(linePoints[linePoints.length - 1].x, margin.top + chartHeight);
  ctx.lineTo(linePoints[0].x, margin.top + chartHeight);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ff7a18';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  linePoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  linePoints.forEach((point) => {
    ctx.fillStyle = '#ffb16b';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const tickCount = Math.min(linePoints.length, 6);
  const interval = Math.max(1, Math.floor(linePoints.length / tickCount));
  ctx.fillStyle = '#a8c1c8';
  ctx.font = '11px Inter';
  ctx.textAlign = 'center';
  linePoints.forEach((point, index) => {
    if (index % interval !== 0 && index !== linePoints.length - 1) return;
    ctx.fillText(toDayLabel(point.day), point.x, height - 14);
  });
  ctx.textAlign = 'left';

  return true;
}

function renderVaultPanel() {
  const statusEl = document.getElementById('vaultStatusBadge');
  const balanceEl = document.getElementById('vaultBalanceValue');
  const availableDateEl = document.getElementById('vaultAvailableDate');
  const hintEl = document.getElementById('vaultWithdrawHint');
  const buttonEl = document.getElementById('vaultWithdrawBtn');
  const collectedEl = document.getElementById('vaultCollectedValue');
  const refundedEl = document.getElementById('vaultRefundedValue');
  const netEl = document.getElementById('vaultNetValue');
  const withdrawnEl = document.getElementById('vaultWithdrawnValue');
  const timelineCanvas = document.getElementById('vaultTimelineChart');
  const timelineEmpty = document.getElementById('vaultTimelineEmpty');
  if (!statusEl || !balanceEl || !availableDateEl || !hintEl || !buttonEl || !collectedEl || !refundedEl || !netEl || !withdrawnEl || !timelineCanvas || !timelineEmpty) return;

  const vault = state.vaultData?.vault || {};
  const status = String(vault.status || '').trim().toLowerCase();
  const isWithdrawn = status === 'withdrawn';
  const canWithdraw = Boolean(state.vaultData?.canWithdraw);
  const withdrawAmount = Number(state.vaultData?.withdrawAmount || vault.balance || 0);
  const withdrawReason = String(state.vaultData?.withdrawReason || '').trim();
  const loading = Boolean(state.vaultLoading);

  const totalCollected = Number(vault.totalCollected || 0);
  const totalRefunded = Number(vault.totalRefunded || 0);
  const totalWithdrawn = Number(vault.totalWithdrawn || 0);
  const netBalance = Number(vault.balance || 0);
  const eventDate = state.summary?.event?.event_date || state.vaultData?.event?.eventDate;
  const ended = isEventEnded(state.summary || {});
  const revenueMirrorValue = Math.max(0, totalCollected - totalRefunded);

  balanceEl.textContent = moneyPrecise(revenueMirrorValue);
  availableDateEl.textContent = `Withdrawal available date: ${toShortDateTime(eventDate)}`;
  collectedEl.textContent = moneyPrecise(totalCollected);
  refundedEl.textContent = moneyPrecise(totalRefunded);
  netEl.textContent = moneyPrecise(netBalance > 0 || totalWithdrawn > 0 ? netBalance : revenueMirrorValue);
  withdrawnEl.textContent = moneyPrecise(totalWithdrawn);

  buttonEl.classList.remove('ready');
  buttonEl.disabled = loading;
  statusEl.className = 'vault-status-badge';

  if (loading) {
    statusEl.textContent = 'Updating...';
    buttonEl.textContent = 'Processing...';
  } else if (isWithdrawn) {
    statusEl.classList.add('withdrawn');
    statusEl.textContent = '✅ Withdrawn';
    buttonEl.textContent = 'Already Withdrawn';
    buttonEl.disabled = true;
    hintEl.textContent = `✅ Withdrawn on ${toShortDateTime(vault.withdrawnAt)} — ${moneyPrecise(totalWithdrawn)} transferred to your wallet`;
  } else if (!ended) {
    statusEl.classList.add('locked');
    statusEl.textContent = '🔒 Escrow Locked';
    buttonEl.textContent = 'Withdraw to Wallet';
    buttonEl.disabled = true;
    hintEl.textContent = `🔒 Available after event ends on ${toShortDateTime(eventDate)}`;
  } else if (canWithdraw && withdrawAmount > 0) {
    statusEl.classList.add('ready');
    statusEl.textContent = '✅ Withdrawal Ready';
    buttonEl.textContent = `Withdraw ${moneyPrecise(withdrawAmount)} to Wallet`;
    buttonEl.classList.add('ready');
    buttonEl.disabled = false;
    hintEl.textContent = '✅ Event has ended — funds are ready for withdrawal';
  } else {
    statusEl.classList.add('locked');
    statusEl.textContent = '⏳ Awaiting Withdrawal';
    buttonEl.textContent = 'Withdraw to Wallet';
    buttonEl.disabled = true;
    hintEl.textContent = withdrawReason || 'No balance available for withdrawal';
  }

  const hasTimeline = drawVaultTimelineChart(timelineCanvas, state.vaultData?.transactions || []);
  timelineEmpty.hidden = hasTimeline;
}

async function loadVaultData() {
  state.vaultLoading = true;
  renderVaultPanel();

  try {
    const { response, data } = await fetchWithAuth(`${API_BASE_URL}/Events/${eventId}/vault`);
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to load vault data');
    }
    state.vaultData = data;
    if (state.summary) {
      const authoritativeRevenue = Math.max(
        0,
        Number(data.vault?.totalCollected || 0) - Number(data.vault?.totalRefunded || 0)
      );
      if (Number.isFinite(authoritativeRevenue)) {
        state.summary.revenue = state.summary.revenue || {};
        state.summary.revenue.total = authoritativeRevenue;
      }
    }
  } catch (error) {
    state.vaultData = {
      vault: {
        balance: 0,
        totalCollected: 0,
        totalRefunded: 0,
        totalWithdrawn: 0,
        status: 'active',
        withdrawnAt: null
      },
      canWithdraw: false,
      withdrawAmount: 0,
      withdrawReason: error.message || 'Unable to load vault data',
      transactions: []
    };
  } finally {
    state.vaultLoading = false;
    if (state.summary) {
      renderStats(state.summary);
      renderBreakdown(state.summary);
    }
    renderVaultPanel();
  }
}

async function handleVaultWithdraw() {
  if (state.vaultLoading) return;

  const vault = state.vaultData?.vault || {};
  const status = String(vault.status || '').trim().toLowerCase();
  const withdrawAmount = Number(state.vaultData?.withdrawAmount || vault.balance || 0);
  const canWithdraw = Boolean(state.vaultData?.canWithdraw) && status !== 'withdrawn' && withdrawAmount > 0;

  if (!canWithdraw) {
    alert(state.vaultData?.withdrawReason || 'Withdrawal is not available yet.');
    return;
  }

  const confirmed = confirm(
    `Are you sure you want to transfer ${moneyPrecise(withdrawAmount)} to your personal wallet?\nThis action cannot be undone.`
  );
  if (!confirmed) return;

  state.vaultLoading = true;
  renderVaultPanel();
  try {
    const { response, data } = await fetchWithAuth(`${API_BASE_URL}/Events/${eventId}/vault/withdraw`, {
      method: 'POST'
    });
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to withdraw vault balance');
    }
    alert(data.message || 'Vault withdrawn successfully');
    await loadVaultData();
  } catch (error) {
    alert(error.message || 'Failed to withdraw vault balance');
  } finally {
    state.vaultLoading = false;
    renderVaultPanel();
  }
}

function ensureSummaryDefaults(summary) {
  const safe = { ...summary };
  safe.event = safe.event || {};
  safe.seats = safe.seats || { byType: {} };
  safe.seats.byType = safe.seats.byType || {};
  safe.revenue = safe.revenue || { byType: {} };
  safe.revenue.byType = safe.revenue.byType || {};
  safe.ratings = safe.ratings || { avg: 0, count: 0 };
  if (!safe.ratings.distribution) {
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (safe.reviews || []).forEach((review) => {
      const score = Math.max(1, Math.min(5, Number(review.rating || 0)));
      dist[Math.round(score)] += 1;
    });
    safe.ratings.distribution = dist;
  }
  safe.cancellations = safe.cancellations || {
    totalBookings: 0,
    count: 0,
    seatsCancelled: 0,
    refundedAmount: 0,
    cancellationRate: 0,
    reasons: []
  };
  safe.timeline = Array.isArray(safe.timeline) ? safe.timeline : [];
  safe.demographics = safe.demographics || { byGovernorate: [], byGender: [] };
  return safe;
}

function renderDashboard(summary) {
  renderHeader(summary);
  renderStats(summary);
  renderBreakdown(summary);
  renderDistributionCharts(summary);
  renderDemographics(summary);
  renderCancellations(summary);
  renderReviews(summary);
}

function setBarView(view) {
  state.barView = view === 'revenue' ? 'revenue' : 'bookings';
  document.getElementById('barBookingsBtn').classList.toggle('is-active', state.barView === 'bookings');
  document.getElementById('barRevenueBtn').classList.toggle('is-active', state.barView === 'revenue');
  if (state.summary) renderDistributionCharts(state.summary);
}

async function fetchWithAuth(url, options = {}) {
  const token = getAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = 'signin.html';
    throw new Error('Session expired. Please sign in again.');
  }
  return { response, data };
}

async function loadSummary() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = 'signin.html';
    return;
  }
  if (!eventId) {
    alert('Event id is missing.');
    window.location.href = 'my-events.html';
    return;
  }

  try {
    const { response, data } = await fetchWithAuth(`${API_BASE_URL}/Events/${eventId}/post-event-summary`);
    if (!response.ok || !data.success || !data.summary) {
      throw new Error(data.message || 'Failed to load post-event summary');
    }

    state.summary = ensureSummaryDefaults(data.summary);
    renderDashboard(state.summary);
    await loadVaultData();
  } catch (error) {
    console.error('Post-event dashboard error:', error);
    document.querySelector('main').innerHTML = `
      <section class="panel">
        <h2 class="section-title">Unable to load dashboard</h2>
        <p class="empty-note" style="margin-top: 10px;">${escapeHtml(error.message || 'Unexpected error')}</p>
        <a class="btn back-btn" href="my-events.html" style="display:inline-flex; margin-top: 14px;">Back to My Events</a>
      </section>
    `;
  }
}

async function exportReport(format) {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/Events/${eventId}/post-event-report?format=${encodeURIComponent(format)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || 'Export failed');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = format === 'pdf' ? `event-report-${eventId}.pdf` : `event-report-${eventId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    alert(error.message || 'Export failed');
  }
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.summary) return;
    renderDistributionCharts(state.summary);
    renderDemographics(state.summary);
    if (state.vaultData) renderVaultPanel();
  }, 120);
});

document.getElementById('barBookingsBtn').addEventListener('click', () => setBarView('bookings'));
document.getElementById('barRevenueBtn').addEventListener('click', () => setBarView('revenue'));
document.getElementById('exportExcelBtn').addEventListener('click', () => exportReport('excel'));
document.getElementById('exportPdfBtn').addEventListener('click', () => exportReport('pdf'));
document.getElementById('vaultWithdrawBtn').addEventListener('click', handleVaultWithdraw);

loadSummary();


