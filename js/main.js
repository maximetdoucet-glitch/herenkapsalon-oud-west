(() => {
  'use strict';

  // ---- Sticky nav background on scroll ----
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile menu ----
  const burger = document.getElementById('nav-burger');
  const mobile = document.getElementById('nav-mobile');
  const closeMobile = () => {
    burger.classList.remove('is-open');
    mobile.classList.remove('is-open');
    document.body.style.overflow = '';
  };
  burger.addEventListener('click', () => {
    burger.classList.toggle('is-open');
    mobile.classList.toggle('is-open');
    document.body.style.overflow = mobile.classList.contains('is-open') ? 'hidden' : '';
  });
  mobile.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));
  const mobileClose = document.getElementById('nav-mobile-close');
  if (mobileClose) mobileClose.addEventListener('click', closeMobile);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobile.classList.contains('is-open')) closeMobile();
  });

  // ---- Today's hours highlight + open/closed badge ----
  const SCHEDULE = {
    1: null, 2: [9, 0, 18, 0], 3: [9, 0, 19, 0], 4: [9, 0, 18, 0],
    5: [9, 0, 18, 0], 6: [9, 0, 17, 0], 0: null
  };

  const now = new Date();
  const day = now.getDay();
  const minsNow = now.getHours() * 60 + now.getMinutes();

  const todayRow = document.querySelector(`#hours tr[data-day="${day}"]`);
  if (todayRow) todayRow.classList.add('is-today');

  const badge = document.getElementById('open-badge');
  if (badge) {
    const sched = SCHEDULE[day];
    if (!sched) {
      badge.textContent = 'gesloten vandaag';
      badge.className = 'badge badge--closed';
    } else {
      const [oH, oM, cH, cM] = sched;
      const open  = oH * 60 + oM;
      const close = cH * 60 + cM;
      if (minsNow >= open && minsNow < close) {
        badge.textContent = `nu open · tot ${cH}:${String(cM).padStart(2,'0')}`;
        badge.className = 'badge badge--open';
      } else {
        badge.textContent = 'nu gesloten';
        badge.className = 'badge badge--closed';
      }
    }
  }

  // ---- Reveal-on-scroll ----
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-in'));
  }

  // ---- Hero video rotator — all clips loop continuously, only opacity crossfades ----
  const heroVideos = Array.from(document.querySelectorAll('#hero-videos .hero__video'));
  if (heroVideos.length > 0) {
    const INTERVAL_MS = 5000;
    let active = 0;

    const tryPlay = (v) => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    heroVideos.forEach((v) => {
      tryPlay(v);
      v.addEventListener('ended', () => {
        try { v.currentTime = 0; } catch (_) {}
        tryPlay(v);
      });
    });

    setInterval(() => {
      const next = (active + 1) % heroVideos.length;
      heroVideos[next].classList.add('is-active');
      heroVideos[active].classList.remove('is-active');
      tryPlay(heroVideos[next]);
      active = next;
    }, INTERVAL_MS);
  }

  // ---- Booking modal ----
  const bookModal = document.getElementById('book-modal');
  if (bookModal) {
    const panes = Array.from(bookModal.querySelectorAll('.book__pane'));
    const stepEls = Array.from(bookModal.querySelectorAll('.book__step'));
    const datesEl = document.getElementById('book-dates');
    const timesEl = document.getElementById('book-times');
    const barbersEl = document.getElementById('book-barbers');
    const form = document.getElementById('book-form');
    const btnNext = document.getElementById('book-next');
    const btnBack = document.getElementById('book-back');
    const foot = document.getElementById('book-foot');
    const summaryMini = document.getElementById('book-summary-mini');

    const DUTCH_DAYS  = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
    const DUTCH_MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const DUTCH_DAYS_LONG = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

    // Map our service button data-service value → Cal.com event type slug
    const SERVICE_SLUG = {
      'cut': 'knippen',
      'cut-beard': 'knip-baard',
      'beard': 'baard'
    };

    // Cached event types (loaded from /api/event-types on first open)
    let eventTypes = null;
    let eventTypesPromise = null;

    // No slot caching — always fetch live availability when entering step 3.

    // Shop opening hours (used to build the full day grid; slots not in Cal.com's
    // available list will be shown as disabled / crossed-out). Should mirror the
    // working hours configured in Cal.com.
    const SHOP_HOURS = {
      2: [10, 18],  // Tue 10:00–18:00
      3: [10, 18],  // Wed 10:00–18:00
      4: [10, 20],  // Thu 10:00–20:00
      5: [10, 19],  // Fri 10:00–19:00
      6: [10, 19]   // Sat 10:00–19:00
      // Mon (1) + Sun (0) closed
    };

    const state = {
      step: 1,
      service: null,
      serviceLabel: null,
      duration: 30,
      price: null,
      date: null,
      time: null,           // "HH:MM" local
      timeIso: null,        // matching ISO from Cal.com slot response
      barber: 'any',
      barberLabel: 'Geen voorkeur',
      name: '',
      email: '',
      phone: ''
    };

    function fetchEventTypes() {
      if (eventTypes) return Promise.resolve(eventTypes);
      if (eventTypesPromise) return eventTypesPromise;
      eventTypesPromise = fetch('/api/event-types')
        .then(r => r.json())
        .then(data => {
          if (!data || !Array.isArray(data.eventTypes)) throw new Error('Invalid response');
          eventTypes = data.eventTypes;
          return eventTypes;
        })
        .catch(err => {
          console.error('[booking] event types failed', err);
          eventTypesPromise = null;
          throw err;
        });
      return eventTypesPromise;
    }

    function eventTypeForService(service) {
      if (!eventTypes) return null;
      const slug = SERVICE_SLUG[service];
      return eventTypes.find(et => et.slug === slug) || null;
    }

    function dateKey(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    /* Open / close */
    const open = () => {
      bookModal.classList.add('is-open');
      bookModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      goToStep(1);
      // Warm up event types in the background so the slots step is ready
      fetchEventTypes().catch(() => {});
    };
    const close = () => {
      bookModal.classList.remove('is-open');
      bookModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    document.querySelectorAll('[data-book]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        // Also close mobile menu if open
        if (mobile && mobile.classList.contains('is-open')) closeMobile();
        open();
      });
    });
    bookModal.querySelectorAll('[data-book-close]').forEach(el => {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && bookModal.classList.contains('is-open')) close();
    });

    /* Steps */
    const PANE_BY_STEP = { 1: 'service', 2: 'date', 3: 'time', 4: 'details', 5: 'confirm' };

    function goToStep(step) {
      state.step = step;
      const paneName = PANE_BY_STEP[step];
      panes.forEach(p => p.classList.toggle('is-active', p.dataset.pane === paneName));
      stepEls.forEach(s => {
        const n = parseInt(s.dataset.step, 10);
        s.classList.toggle('is-active', n === step);
        s.classList.toggle('is-done', n < step);
      });

      // Footer visibility
      if (step === 5) {
        foot.classList.add('is-hidden');
      } else {
        foot.classList.remove('is-hidden');
        btnBack.classList.toggle('is-hidden', step === 1);
        updateNextButton();
        updateSummaryMini();
      }

      // Lazy-build the relevant pane
      if (step === 2 && !datesEl.children.length) buildDates();
      if (step === 3) buildTimes();
    }

    function updateNextButton() {
      let enabled = false;
      if (state.step === 1) enabled = !!state.service;
      else if (state.step === 2) enabled = !!state.date;
      else if (state.step === 3) enabled = !!state.time;
      else if (state.step === 4) enabled = isFormValid();
      btnNext.disabled = !enabled;
      btnNext.querySelector('svg').style.display = state.step === 4 ? 'none' : '';
      btnNext.firstChild.textContent = state.step === 4 ? 'Bevestigen ' : 'Volgende ';
    }

    function updateSummaryMini() {
      const parts = [];
      if (state.serviceLabel) parts.push(`<strong>${state.service ? formatServiceShort() : ''}</strong>`);
      if (state.date) parts.push(formatDateShort(state.date));
      if (state.time) parts.push(state.time);
      summaryMini.innerHTML = parts.join(' · ');
    }

    function formatServiceShort() {
      if (state.service === 'cut') return 'Haar';
      if (state.service === 'cut-beard') return 'Haar & Baard';
      if (state.service === 'beard') return 'Baard';
      return '';
    }

    function formatDateShort(d) {
      return `${DUTCH_DAYS[d.getDay()]} ${d.getDate()} ${DUTCH_MONTHS[d.getMonth()]}`;
    }

    function formatDateLong(d) {
      return `${DUTCH_DAYS_LONG[d.getDay()]} ${d.getDate()} ${DUTCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }

    /* Step 1: services */
    bookModal.querySelectorAll('.book__service').forEach(btn => {
      btn.addEventListener('click', () => {
        bookModal.querySelectorAll('.book__service').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.service = btn.dataset.service;
        state.serviceLabel = btn.dataset.label;
        state.duration = parseInt(btn.dataset.duration, 10);
        state.price = parseInt(btn.dataset.price, 10);
        // Override duration with the real Cal.com event-type length once loaded.
        fetchEventTypes().then(() => {
          const et = eventTypeForService(state.service);
          if (et && et.length) state.duration = et.length;
        }).catch(() => {});
        updateNextButton();
        updateSummaryMini();
      });
    });

    /* Step 2: dates */
    function buildDates() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      datesEl.innerHTML = '';

      for (let i = 0; i < 21; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dow = d.getDay();
        const closed = !(dow in SHOP_HOURS);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'book__date';
        if (closed) btn.disabled = true;

        const label = i === 0 ? 'Vandaag' : (i === 1 ? 'Morgen' : DUTCH_DAYS[dow]);
        btn.innerHTML = `
          <span class="book__date-day">${label}</span>
          <span class="book__date-num">${d.getDate()}</span>
          <span class="book__date-mon">${DUTCH_MONTHS[d.getMonth()]}</span>
        `;
        btn.addEventListener('click', () => {
          datesEl.querySelectorAll('.book__date').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          state.date = new Date(d);
          state.time = null;
          state.timeIso = null;
          updateNextButton();
          updateSummaryMini();
        });
        datesEl.appendChild(btn);
      }
    }

    /* Step 3: times — fetched live from Cal.com via /api/slots */
    async function buildTimes() {
      timesEl.innerHTML = '<p class="book__hint">Beschikbaarheid laden…</p>';
      if (!state.date || !state.service) return;

      let et;
      try {
        await fetchEventTypes();
        et = eventTypeForService(state.service);
      } catch (err) {
        timesEl.innerHTML = '<p class="book__hint">Kon beschikbaarheid niet laden. Probeer het opnieuw.</p>';
        return;
      }

      if (!et) {
        timesEl.innerHTML = `<p class="book__hint">Geen Cal.com event type gevonden voor "${SERVICE_SLUG[state.service]}". Maak deze aan in Cal.com.</p>`;
        return;
      }

      const dKey = dateKey(state.date);

      // Query the entire selected day in local TZ — always fresh, no cache.
      const dayStart = new Date(state.date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(state.date); dayEnd.setHours(23, 59, 59, 999);

      const params = new URLSearchParams({
        eventTypeId: String(et.id),
        startTime: dayStart.toISOString(),
        endTime: dayEnd.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam'
      });

      let slots;
      try {
        const r = await fetch('/api/slots?' + params.toString(), { cache: 'no-store' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || data.error || 'slots failed');

        const dayList = (data.slots && data.slots[dKey]) || [];
        slots = dayList.map(s => {
          const iso = s.time;
          const dt = new Date(iso);
          const label = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          return { label, iso };
        });
      } catch (err) {
        console.error('[booking] slots fetch failed', err);
        timesEl.innerHTML = '<p class="book__hint">Kon beschikbaarheid niet laden. Controleer dat de Cal.com API key is ingesteld in <code>.env</code>.</p>';
        return;
      }

      // Build the full day grid based on shop hours + event-type length,
      // then mark each slot as available (in Cal.com's list) or taken (disabled).
      const dow = state.date.getDay();
      const range = SHOP_HOURS[dow];
      timesEl.innerHTML = '';
      if (!range) {
        timesEl.innerHTML = '<p class="book__hint">Gesloten op deze dag — kies een andere datum.</p>';
        return;
      }

      const inc = state.duration || 30;
      const [openH, closeH] = range;
      const availableByLabel = new Map(slots.map(s => [s.label, s.iso]));

      const now = new Date();
      const isToday = state.date.toDateString() === now.toDateString();
      const minToday = now.getHours() * 60 + now.getMinutes();

      for (let m = openH * 60; m + inc <= closeH * 60; m += inc) {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        const label = `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'book__time';
        btn.textContent = label;

        const isAvailable = availableByLabel.has(label);
        const isPast = isToday && m <= minToday;
        if (!isAvailable || isPast) btn.disabled = true;

        if (isAvailable && !isPast) {
          btn.addEventListener('click', () => {
            timesEl.querySelectorAll('.book__time').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            state.time = label;
            state.timeIso = availableByLabel.get(label);
            updateNextButton();
            updateSummaryMini();
          });
        }

        timesEl.appendChild(btn);
      }

      if (!availableByLabel.size) {
        const note = document.createElement('p');
        note.className = 'book__hint';
        note.style.gridColumn = '1 / -1';
        note.textContent = 'Geen beschikbare tijden op deze dag — kies een andere datum.';
        timesEl.appendChild(note);
      }
    }

    /* Barber pick rebuilds time slots */
    barbersEl.querySelectorAll('.book__barber').forEach(btn => {
      btn.addEventListener('click', () => {
        barbersEl.querySelectorAll('.book__barber').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.barber = btn.dataset.barber;
        state.barberLabel = btn.textContent.trim();
        state.time = null;
        buildTimes();
        updateNextButton();
        updateSummaryMini();
      });
    });

    /* Step 4: form */
    function isFormValid() {
      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      return name.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    form.addEventListener('input', () => updateNextButton());

    /* Footer nav */
    btnNext.addEventListener('click', async () => {
      if (state.step === 4) {
        if (!isFormValid()) return;
        const data = new FormData(form);
        state.name  = data.get('name').toString().trim();
        state.email = data.get('email').toString().trim();
        state.phone = (data.get('phone') || '').toString().trim();
        await submitBooking();
      } else {
        goToStep(state.step + 1);
      }
    });
    btnBack.addEventListener('click', () => {
      if (state.step > 1) goToStep(state.step - 1);
    });

    async function submitBooking() {
      const et = eventTypeForService(state.service);
      if (!et || !state.timeIso) {
        showError('Iets ging mis — kies opnieuw een tijdslot.');
        return;
      }

      btnNext.disabled = true;
      btnNext.firstChild.textContent = 'Bezig… ';

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
      const payload = {
        eventTypeId: et.id,
        start: state.timeIso,
        timeZone: tz,
        language: 'nl',
        responses: {
          name: state.name,
          email: state.email,
          notes: state.barber !== 'any' ? `Voorkeur barber: ${state.barberLabel}` : '',
          ...(state.phone ? { phone: state.phone } : {})
        },
        metadata: {
          source: 'barbershop080.nl',
          barberPreference: state.barber
        }
      };

      try {
        const r = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await r.json();
        if (!r.ok) {
          const msg = data.message || data.error || 'Boeking mislukt';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        showConfirmation();
      } catch (err) {
        console.error('[booking] POST failed', err);
        showError(err.message || 'Boeking mislukt — probeer het opnieuw.');
      } finally {
        btnNext.disabled = false;
        updateNextButton();
      }
    }

    function showError(msg) {
      let bar = document.getElementById('book-error');
      if (!bar) {
        bar = document.createElement('p');
        bar.id = 'book-error';
        bar.className = 'book__hint';
        bar.style.color = '#d97a7a';
        bar.style.marginTop = '1rem';
        form.parentElement.appendChild(bar);
      }
      bar.textContent = msg;
    }

    /* Confirmation screen */
    function showConfirmation() {
      const summary = document.getElementById('book-summary');
      const startDate = new Date(state.timeIso || state.date);
      const endDate = new Date(startDate.getTime() + state.duration * 60 * 1000);

      summary.innerHTML = `
        <dt>Dienst</dt>      <dd>${state.serviceLabel}</dd>
        <dt>Datum</dt>       <dd>${formatDateLong(startDate)}</dd>
        <dt>Tijd</dt>        <dd>${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())} – ${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}</dd>
        <dt>Barber</dt>      <dd>${state.barberLabel}</dd>
        <dt>Naam</dt>        <dd>${escapeHtml(state.name)}</dd>
        <dt>Prijs</dt>       <dd>€${state.price}</dd>
      `;

      document.getElementById('book-confirm-email').textContent = state.email;
      document.getElementById('book-ics').href = buildIcsDataUri(startDate, endDate);

      goToStep(5);
    }

    function pad2(n) { return String(n).padStart(2, '0'); }
    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function buildIcsDataUri(start, end) {
      const fmt = d =>
        d.getUTCFullYear() +
        pad2(d.getUTCMonth() + 1) +
        pad2(d.getUTCDate()) + 'T' +
        pad2(d.getUTCHours()) +
        pad2(d.getUTCMinutes()) +
        pad2(d.getUTCSeconds()) + 'Z';

      const uid = 'bs080-' + Math.random().toString(36).slice(2) + '@barbershop080.nl';
      const summary = `Barbershop 080 — ${state.serviceLabel}`;
      const description = `Afspraak: ${state.serviceLabel}\\nBarber: ${state.barberLabel}\\nNaam: ${state.name}\\nPrijs: €${state.price}\\n\\nKrayenhofflaan 329, 6541 PS Nijmegen`;

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Barbershop 080//Booking//NL',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'LOCATION:Krayenhofflaan 329\\, 6541 PS Nijmegen',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    }
  }

  // ---- Gallery rail prev/next ----
  const rail = document.getElementById('gallery-rail');
  const prev = document.getElementById('gallery-prev');
  const next = document.getElementById('gallery-next');
  if (rail && prev && next) {
    const stepBy = () => {
      const item = rail.querySelector('.gallery__item');
      if (!item) return 320;
      const style = getComputedStyle(rail.querySelector('.gallery__track'));
      const gap = parseFloat(style.gap) || 16;
      return item.getBoundingClientRect().width + gap;
    };
    const updateBtns = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    };
    prev.addEventListener('click', () => rail.scrollBy({ left: -stepBy(), behavior: 'smooth' }));
    next.addEventListener('click', () => rail.scrollBy({ left:  stepBy(), behavior: 'smooth' }));
    rail.addEventListener('scroll', updateBtns, { passive: true });
    updateBtns();
  }
})();
