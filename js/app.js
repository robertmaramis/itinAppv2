(function () {
  let data = null;
  let currentView = 'itinerary';
  let pendingPhotoItemId = null;
  let lastSyncOk = false;
  const photoObjectUrls = {};
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function pickIcon(label) {
    const l = (label || '').toLowerCase();
    if (/train|stn|station|rapid|airport line|otw|to \w|walk|metro|line\b/.test(l) && !/lunch|dinner|breakfast/.test(l)) return 'i-train';
    if (/lunch|dinner|makan|cafe|sushi|ramen|breakfast|brunch|eat/.test(l)) return 'i-bowl';
    if (/shop|beli|don quijote|market|souvenir/.test(l)) return 'i-bag';
    if (/hotel|check.?in|checkout|rest|sleep|hostel|airbnb|inn/.test(l)) return 'i-bed';
    return 'i-camera';
  }

  function dowLabel(d) {
    return d || '';
  }

  // ---------- Decorative / interactive flourishes ----------

  function renderGreeting() {
    const el = document.getElementById('greeting');
    if (!el) return;
    const h = new Date().getHours();
    el.textContent = h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
  }

  function initSakuraLayer() {
    if (prefersReducedMotion) return;
    const layer = document.getElementById('sakuraLayer');
    if (!layer || layer.childElementCount) return;
    const COUNT = 10;
    for (let i = 0; i < COUNT; i++) {
      const petal = document.createElement('span');
      petal.className = 'petal';
      petal.innerHTML = '<svg><use href="#i-petal"/></svg>';
      const size = 9 + Math.random() * 9;
      const duration = 9 + Math.random() * 8;
      const delay = Math.random() * -duration;
      const drift = Math.round(Math.random() * 120 - 60) + 'px';
      petal.style.left = (Math.random() * 100) + '%';
      petal.style.width = size + 'px';
      petal.style.height = size + 'px';
      petal.style.opacity = (0.45 + Math.random() * 0.4).toFixed(2);
      petal.style.animationDuration = duration + 's';
      petal.style.animationDelay = delay + 's';
      petal.style.setProperty('--drift', drift);
      layer.appendChild(petal);
    }
  }

  function spawnPetalBurst(x, y) {
    if (prefersReducedMotion) return;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dist = 36 + Math.random() * 28;
      const p = document.createElement('span');
      p.className = 'petal-burst';
      p.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-petal"/></svg>';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 180 - 90) + 'deg');
      document.body.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }

  function attachRipple(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.classList.add('ripple-host');
      if (el.dataset.rippleBound) return;
      el.dataset.rippleBound = '1';
      el.addEventListener('pointerdown', (e) => {
        if (prefersReducedMotion) return;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.6;
        const span = document.createElement('span');
        span.className = 'ripple';
        span.style.width = size + 'px';
        span.style.height = size + 'px';
        span.style.left = (e.clientX - rect.left - size / 2) + 'px';
        span.style.top = (e.clientY - rect.top - size / 2) + 'px';
        el.appendChild(span);
        span.addEventListener('animationend', () => span.remove());
      });
    });
  }

  function effectiveTheme() {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateThemeIcon() {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    const isDark = effectiveTheme() === 'dark';
    btn.innerHTML = `<svg><use href="#${isDark ? 'i-moon' : 'i-sun'}"/></svg>`;
    btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function initTheme() {
    const stored = window.ItinStore && ItinStore.getTheme();
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
    updateThemeIcon();

    const btn = document.getElementById('themeBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        if (window.ItinStore) ItinStore.setTheme(next);
        updateThemeIcon();
      });
    }

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const current = window.ItinStore && ItinStore.getTheme();
        if (current !== 'light' && current !== 'dark') updateThemeIcon();
      });
    }
  }

  function updateTabIndicator() {
    const indicator = document.getElementById('tabIndicator');
    const activeBtn = document.querySelector('.tabbtn.active');
    const bar = document.querySelector('.tabbar');
    if (!indicator || !activeBtn || !bar) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.width = (btnRect.width * 0.46) + 'px';
    indicator.style.left = (btnRect.left - barRect.left + btnRect.width * 0.27) + 'px';
  }

  // ---------- Topbar ----------

  function renderTopbar() {
    const trip = (data && data.trip) || {};
    document.getElementById('tripTitle').textContent = trip.title || 'Trip';
    document.getElementById('tripDates').textContent = trip.dates || '';
    document.getElementById('tripDest').textContent = trip.destination || '';
    renderGreeting();

    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    const pill = document.getElementById('syncBtn');
    const meta = data && data.meta;
    const isOk = !!(meta && meta.source === 'sheet' && meta.syncedAt);
    if (isOk) {
      dot.className = 'dot ok';
      const d = new Date(meta.syncedAt);
      label.textContent = 'Synced ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      dot.className = 'dot stale';
      label.textContent = 'Sync';
    }
    pill.classList.toggle('is-synced', isOk);
    if (isOk && !lastSyncOk && !prefersReducedMotion) {
      pill.classList.remove('stamp-pop');
      void pill.offsetWidth;
      pill.classList.add('stamp-pop');
    }
    lastSyncOk = isOk;
  }

  function setSyncing(isSyncing) {
    const btn = document.getElementById('syncBtn');
    btn.classList.toggle('syncing', isSyncing);
    if (isSyncing) document.getElementById('syncLabel').textContent = 'Syncing…';
  }

  function setSyncError() {
    const dot = document.getElementById('syncDot');
    dot.className = 'dot error';
    document.getElementById('syncLabel').textContent = 'Offline';
  }

  // ---------- Itinerary tab ----------

  function activityRowHtml(a, idx) {
    return `
      <li>
        <span class="t-icon"><svg><use href="#${pickIcon(a.label)}"/></svg></span>
        <div class="t-body">
          ${a.time ? `<div class="t-time mono">${escapeHtml(a.time)}</div>` : ''}
          <div class="t-title">${escapeHtml(a.label)}</div>
          ${a.notes ? `<div class="t-note">${linkify(escapeHtml(a.notes))}</div>` : ''}
        </div>
      </li>`;
  }

  function linkify(s) {
    return s.replace(/https?:\/\/[^\s]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">map link</a>`);
  }

  function flightTicketHtml(day) {
    if (!day.flights || !day.flights.length) return '';
    const legs = ItinParser.extractFlightLegs([day]);
    if (!legs.length) return '';
    return `<div class="ticket">` + legs.map((leg) => `
        <div class="route">
          <span class="seg">${escapeHtml(leg.departAirport || '?')}</span>
          <span class="arrow"><svg viewBox="0 0 24 24"><use href="#i-arrow"/></svg></span>
          <span class="seg">${escapeHtml(leg.arriveAirport || '?')}</span>
        </div>
        <div class="ticket-row"><span>${escapeHtml(leg.legTitle || '')}</span><b>${escapeHtml(leg.departTime)} → ${escapeHtml(leg.arriveTime)}</b></div>
        ${leg.flightCode ? `<div class="ticket-row"><span>Flight</span><b class="mono">${escapeHtml(leg.flightCode)}</b></div>` : ''}
        ${leg.confirmation ? `<div class="ticket-row"><span>Confirmation</span><b class="mono">${escapeHtml(leg.confirmation)}</b></div>` : ''}
        ${leg.departAirportName || leg.arriveAirportName ? `<div class="ticket-note">${escapeHtml([leg.departAirportName, leg.arriveAirportName].filter(Boolean).join(' → '))}</div>` : ''}
      `).join('<div class="ticket-divider"></div>') + `</div>`;
  }

  function dayCardHtml(day, idx) {
    const legCount = day.flights && day.flights.length ? ItinParser.extractFlightLegs([day]).length : 0;
    const count = (day.activities ? day.activities.length : 0) + legCount;
    const activityItems = (day.activities || []).map(activityRowHtml).join('');
    const body = flightTicketHtml(day) + (activityItems ? `<ul class="timeline">${activityItems}</ul>` : '');
    return `
      <details class="day"${idx === 0 ? ' open' : ''}>
        <summary>
          <div class="day-date">
            <span class="num">${escapeHtml((day.date || '').split('/')[0])}</span>
            <span class="dow">${escapeHtml(day.dayOfWeek)}</span>
          </div>
          <div class="day-head">
            <div class="label">${escapeHtml(day.date)}</div>
            <h2>${escapeHtml(day.title || 'Untitled day')}</h2>
            <div class="day-count">${count ? count + ' item' + (count === 1 ? '' : 's') : 'Nothing planned yet'}</div>
          </div>
          <svg class="chevron"><use href="#i-chevron"/></svg>
        </summary>
        <div class="day-body">${body || '<div class="empty-state">Nothing planned yet.</div>'}</div>
      </details>`;
  }

  function renderItinerary() {
    const list = document.getElementById('dayList');
    if (!data || !data.days || !data.days.length) {
      list.innerHTML = `<div class="empty-state">No itinerary yet. Pull to sync once you're online.</div>`;
      return;
    }
    list.innerHTML = data.days.map(dayCardHtml).join('');
  }

  // ---------- Flights tab ----------

  function flightStatusUrl(leg) {
    if (leg.flightCode) {
      const q = leg.flightCode.replace(/-/g, '') + ' flight status';
      return 'https://www.google.com/search?q=' + encodeURIComponent(q);
    }
    const q = ['flight status', leg.departAirport, 'to', leg.arriveAirport].filter(Boolean).join(' ');
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  function flightCardHtml(leg) {
    return `
      <div class="flight-card">
        <div class="flight-card-head">
          <span class="flight-date">${escapeHtml(leg.dayOfWeek)}, ${escapeHtml(leg.date)}</span>
          ${leg.flightCode ? `<span class="chip mono">${escapeHtml(leg.flightCode)}</span>` : ''}
        </div>
        ${leg.legTitle ? `<div class="ticket-note">${escapeHtml(leg.legTitle)}</div>` : ''}
        <div class="flight-route">
          <div class="fr-side">
            <div class="fr-time">${escapeHtml(leg.departTime || '--:--')}</div>
            <div class="fr-airport">${escapeHtml(leg.departAirport || '?')}</div>
          </div>
          <span class="arrow"><svg viewBox="0 0 24 24"><use href="#i-arrow"/></svg></span>
          <div class="fr-side right">
            <div class="fr-time">${escapeHtml(leg.arriveTime || '--:--')}</div>
            <div class="fr-airport">${escapeHtml(leg.arriveAirport || '?')}</div>
          </div>
        </div>
        ${leg.departAirportName || leg.arriveAirportName ? `<div class="ticket-note">${escapeHtml([leg.departAirportName, leg.arriveAirportName].filter(Boolean).join(' → '))}</div>` : ''}
        ${leg.confirmation ? `<div class="ticket-row"><span><svg class="inline-icon"><use href="#i-check"/></svg> Confirmation</span><b class="mono">${escapeHtml(leg.confirmation)}</b></div>` : ''}
        <button class="flight-status-btn" type="button" data-status-url="${escapeHtml(flightStatusUrl(leg))}">
          <svg class="inline-icon"><use href="#i-plane"/></svg> Check flight status
        </button>
      </div>`;
  }

  function openStatusPopup(url) {
    const w = 440;
    const h = 680;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    window.open(url, 'flightStatus', `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
  }

  function renderFlights() {
    const el = document.getElementById('flightsList');
    if (!data || !data.days) {
      el.innerHTML = `<div class="empty-state">No flights yet.</div>`;
      return;
    }
    const legs = ItinParser.extractFlightLegs(data.days);
    if (!legs.length) {
      el.innerHTML = `<div class="empty-state">No flights found in the sheet yet.</div>`;
      return;
    }
    el.innerHTML = `<div class="section-title">All flights</div>` + legs.map(flightCardHtml).join('');
    el.querySelectorAll('.flight-status-btn').forEach((btn) => {
      btn.addEventListener('click', () => openStatusPopup(btn.dataset.statusUrl));
    });
  }

  // ---------- Places tab ----------

  const PLACE_PREFIX_RE = /^(otw\s+to\s+|otw\s+|to\s+|strolling\s+|balik\s+ke\s+|dari\s+)/i;
  const PLACE_STOPWORDS = new Set([
    'lunch', 'dinner', 'breakfast', 'brunch', 'preparation', 'siap siap', 'checkout',
    'rest', 'free day', 'free time', 'shopping', 'foto', 'back', 'airport', 'hotel', 'otw',
    'imigrasi baggage', 'bagage claim', 'check in rest', 'back to hotel', 'back to tokyo',
    'back to sapporo', 'pickup di hotel', 'prepare', 'preparing otw', 'bos',
    'train to hokkaido', 'drop baggage on hotel', 'di jemput untuk ke asahiyama',
    'fly to tokyo', 'waiting for shopping',
  ]);

  function placeNameFromLabel(label) {
    return (label || '').trim().replace(PLACE_PREFIX_RE, '').trim();
  }

  function normPlaceKey(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function extractMapsUrl(notes) {
    if (!notes) return null;
    const m = notes.match(/https?:\/\/\S+/);
    return m ? m[0] : null;
  }

  function buildPlaces() {
    const entries = [];
    ((data && data.days) || []).forEach((day) => {
      (day.activities || []).forEach((a) => {
        const name = placeNameFromLabel(a.label);
        const key = normPlaceKey(name);
        if (!key || key.length < 3 || PLACE_STOPWORDS.has(key)) return;
        const mapsUrl = extractMapsUrl(a.notes);
        // Merge near-duplicates: "Hase-dera" and "Strolling hase dera" are the
        // same stop, just phrased differently a row or two apart.
        const match = entries.find((e) => e.key === key || e.key.includes(key) || key.includes(e.key));
        if (match) {
          if (name.length > match.name.length) {
            match.name = name;
            match.key = key;
          }
          if (!match.dates.includes(day.date)) match.dates.push(day.date);
          if (!match.mapsUrl && mapsUrl) match.mapsUrl = mapsUrl;
        } else {
          entries.push({ name, key, dates: [day.date], mapsUrl: mapsUrl || null, area: day.title || 'Other' });
        }
      });
    });
    return entries;
  }

  function groupPlacesByArea(places) {
    const groups = new Map();
    places.forEach((p) => {
      if (!groups.has(p.area)) groups.set(p.area, []);
      groups.get(p.area).push(p);
    });
    return groups;
  }

  function placeRowHtml(p) {
    const href = p.mapsUrl || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name + ', Japan');
    return `
      <a class="place-row" href="${href}" target="_blank" rel="noopener">
        <span class="t-icon"><svg><use href="#i-pin"/></svg></span>
        <div class="t-body">
          <div class="t-title">${escapeHtml(p.name)}</div>
          <div class="t-note">${p.dates.map(escapeHtml).join(', ')}</div>
        </div>
        <svg class="chevron"><use href="#i-chevron"/></svg>
      </a>`;
  }

  function renderPlaces() {
    const el = document.getElementById('placesList');
    const places = buildPlaces();
    if (!places.length) {
      el.innerHTML = `<div class="empty-state">No places found yet.</div>`;
      return;
    }
    const groups = groupPlacesByArea(places);
    let html = '';
    groups.forEach((list, area) => {
      html += `<div class="section-title">${escapeHtml(area)}</div><div class="place-list">${list.map(placeRowHtml).join('')}</div>`;
    });
    el.innerHTML = html;
  }

  // ---------- Overview tab ----------

  function renderOverview() {
    const el = document.getElementById('overviewBody');
    const trip = (data && data.trip) || {};
    const days = (data && data.days) || [];
    const plannedDays = days.filter((d) => (d.activities && d.activities.length) || (d.flights && d.flights.length)).length;
    const cities = Array.from(new Set(days.map((d) => d.title).filter(Boolean)));

    el.innerHTML = `
      <div class="hero">
        <div class="hero-main">
          <div class="hero-title display">${escapeHtml(trip.title || 'Trip')}</div>
          <div class="hero-sub">${escapeHtml(trip.destination || '')}</div>
        </div>
        <div class="hero-stub">
          <span class="hero-stub-label">dates</span>
          <span class="hero-stub-value mono">${escapeHtml(trip.dates || '—')}</span>
        </div>
      </div>

      <div class="travelers-card">
        <div class="section-title">Travellers</div>
        <div class="travelers-grid">
          ${(trip.travelers || []).map((t) => `<div class="traveler-pill">${escapeHtml(t)}</div>`).join('')}
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-num">${days.length}</div><div class="stat-label">Days</div></div>
        <div class="stat-card"><div class="stat-num">${plannedDays}</div><div class="stat-label">Planned</div></div>
        <div class="stat-card"><div class="stat-num">${(trip.travelers || []).length}</div><div class="stat-label">Travellers</div></div>
      </div>
    `;
  }

  // ---------- Bucket list tab ----------

  function renderBucket() {
    const el = document.getElementById('bucketBody');
    const items = (data && data.bucketList) || [];
    if (!items.length) {
      el.innerHTML = `<div class="empty-state">No bucket list items yet.</div>`;
      return;
    }
    const checked = ItinStore.getChecked();
    const doneCount = items.filter((it) => checked[it.id]).length;
    const canPhoto = window.PhotoStore && PhotoStore.isSupported();

    el.innerHTML = `
      <div class="progress-row">
        <span id="bucketProgressLabel">${doneCount} of ${items.length} done</span>
        <span class="progress-track"><span class="progress-fill" style="width:${items.length ? (doneCount / items.length * 100) : 0}%"></span></span>
      </div>
      <div class="bucket-card">
        ${items.map((it) => `
          <div class="bucket-row">
            <div class="bucket-row-main">
              <label class="bucket-item">
                <input type="checkbox" data-id="${it.id}" ${checked[it.id] ? 'checked' : ''}>
                <span class="bucket-label">${escapeHtml(it.text)}</span>
              </label>
              ${canPhoto ? `
                <button class="photo-btn" type="button" data-photo-item="${it.id}" aria-label="Add photo">
                  <svg><use href="#i-camera"/></svg>
                </button>` : ''}
            </div>
            <div class="photo-strip" id="photos-${it.id}"></div>
          </div>`).join('')}
      </div>
    `;

    el.querySelectorAll('[data-id]').forEach((input) => {
      input.addEventListener('change', () => {
        ItinStore.setChecked(input.dataset.id, input.checked);
        const newChecked = ItinStore.getChecked();
        const done = items.filter((it) => newChecked[it.id]).length;
        el.querySelector('#bucketProgressLabel').textContent = done + ' of ' + items.length + ' done';
        el.querySelector('.progress-fill').style.width = (items.length ? (done / items.length * 100) : 0) + '%';
        if (input.checked) {
          const r = input.getBoundingClientRect();
          spawnPetalBurst(r.left + r.width / 2, r.top + r.height / 2);
        }
      });
    });

    if (canPhoto) {
      el.querySelectorAll('.photo-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          pendingPhotoItemId = btn.dataset.photoItem;
          document.getElementById('bucketPhotoInput').click();
        });
      });
      items.forEach((it) => renderPhotoStrip(it.id));
    }
  }

  async function renderPhotoStrip(itemId) {
    const strip = document.getElementById('photos-' + itemId);
    if (!strip || !window.PhotoStore) return;
    let photos;
    try {
      photos = await PhotoStore.getPhotos(itemId);
    } catch (e) {
      return;
    }
    (photoObjectUrls[itemId] || []).forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls[itemId] = photos.map((p) => URL.createObjectURL(p.blob));

    strip.innerHTML = photos.map((p, i) => `
      <button class="photo-thumb" type="button" data-photo-id="${p.id}" aria-label="Remove photo">
        <img src="${photoObjectUrls[itemId][i]}" alt="">
      </button>`).join('');

    strip.querySelectorAll('.photo-thumb').forEach((thumb) => {
      thumb.addEventListener('click', async () => {
        if (!confirm('Remove this photo?')) return;
        await PhotoStore.deletePhoto(Number(thumb.dataset.photoId));
        renderPhotoStrip(itemId);
      });
    });
  }

  function initPhotoCapture() {
    const input = document.getElementById('bucketPhotoInput');
    if (!input || !window.PhotoStore) return;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      const itemId = pendingPhotoItemId;
      input.value = '';
      if (!file || !itemId) return;
      try {
        await PhotoStore.addPhoto(itemId, file);
        renderPhotoStrip(itemId);
      } catch (e) {
        console.warn('Could not save photo', e);
      }
    });
  }

  // ---------- Render dispatch ----------

  function render(freshData) {
    if (freshData) data = freshData;
    renderTopbar();
    renderPlaces();
    renderItinerary();
    renderFlights();
    renderOverview();
    renderBucket();
    attachRipple('.place-row, .day > summary, .flight-status-btn, .bucket-item, .photo-btn, .photo-thumb');
  }

  // ---------- Tabs ----------

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach((v) => {
      const show = v.dataset.view === view;
      v.hidden = !show;
      if (show && !prefersReducedMotion) {
        v.classList.remove('view-enter');
        void v.offsetWidth;
        v.classList.add('view-enter');
      }
    });
    document.querySelectorAll('.tabbtn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    updateTabIndicator();
  }

  // ---------- Sync ----------

  async function doSync(manual) {
    if (!navigator.onLine) {
      if (manual) setSyncError();
      return;
    }
    setSyncing(true);
    try {
      const fresh = await SheetSync.syncFromSheet();
      render(fresh);
    } catch (e) {
      console.warn('Sheet sync failed', e);
      setSyncError();
    } finally {
      setSyncing(false);
    }
  }

  // ---------- Init ----------

  async function init() {
    let initial = ItinStore.load();
    if (!initial) {
      try {
        const res = await fetch('data/seed.json');
        initial = await res.json();
      } catch (e) {
        initial = null;
      }
    }
    render(initial);
    initSakuraLayer();
    initTheme();
    attachRipple('.tabbtn, .sync-pill, .theme-btn');
    updateTabIndicator();
    window.addEventListener('resize', updateTabIndicator);

    document.querySelectorAll('.tabbtn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.getElementById('syncBtn').addEventListener('click', () => doSync(true));
    window.addEventListener('online', () => doSync(false));
    initPhotoCapture();

    doSync(false);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
