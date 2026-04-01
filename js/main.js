/* ===== Cafayate.com Main JS ===== */

(function () {
  'use strict';

  // Detect language from path
  const isEnglish = window.location.pathname.startsWith('/en/') || window.location.pathname === '/en';

  // ===== MOBILE NAV TOGGLE =====
  const navToggle = document.querySelector('.nav-toggle');
  const navList = document.querySelector('.nav-list');
  if (navToggle && navList) {
    navToggle.addEventListener('click', function () {
      navList.classList.toggle('open');
    });
    // Close menu when clicking a link
    navList.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navList.classList.remove('open');
      });
    });
  }

  // ===== SCROLL TO TOP BUTTON =====
  const scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 400) {
        scrollBtn.classList.add('visible');
      } else {
        scrollBtn.classList.remove('visible');
      }
    });
    scrollBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== ACTIVE NAV HIGHLIGHTING =====
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-list a').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href.replace(/^\.\.\//, '').replace(/^\.\//, ''))) {
      link.classList.add('active');
    }
  });

  // ===== DYNAMIC BODEGAS RENDERING =====
  const bodegaContainer = document.getElementById('bodega-list');
  if (bodegaContainer) {
    const dataPath = bodegaContainer.dataset.src || '/data/bodegas.json';
    fetch(dataPath)
      .then(function (r) { return r.json(); })
      .then(function (bodegas) {
        renderBodegas(bodegas, bodegaContainer);
      })
      .catch(function (err) {
        console.error('Error loading bodegas:', err);
        bodegaContainer.innerHTML = '<p class="no-events">Error loading bodega data.</p>';
      });
  }

  function renderBodegas(bodegas, container) {
    var lang = isEnglish ? 'en' : 'es';
    var extremeHTML = '';
    var highHTML = '';

    bodegas.forEach(function (b) {
      var desc = b['description_' + lang] || b.description_es || '';
      var card = '<div class="bodega-card">' +
        (b.image ? '<img class="bodega-card-img" src="' + b.image + '" alt="' + b.name + '">' : '<div class="bodega-card-img"></div>') +
        '<div class="bodega-card-info">' +
        '<h3>' + b.name + '</h3>' +
        '<div class="bodega-altitude">' + b.altitude + ' ' + (isEnglish ? 'm.a.s.l.' : 'm.s.n.m.') + '</div>' +
        '<p>' + desc + '</p>' +
        (b.website ? '<a class="bodega-website" href="' + b.website + '" target="_blank" rel="noopener">' + (isEnglish ? 'Visit website' : 'Sitio web') + ' &rarr;</a>' : '') +
        '</div></div>';

      if (b.category === 'extreme') {
        extremeHTML += card;
      } else {
        highHTML += card;
      }
    });

    var titleExtreme = isEnglish ? 'Extreme Altitude Winemakers' : 'En\u00f3logos de Altitud Extrema';
    var subtitleExtreme = isEnglish ? 'Vineyards above 2,200 m.a.s.l.' : 'Vi\u00f1edos por encima de los 2,200 m.s.n.m.';
    var titleHigh = isEnglish ? 'High Altitude Winemakers' : 'En\u00f3logos de Altitud';
    var subtitleHigh = isEnglish ? 'Vineyards between 1,500 and 2,200 m.a.s.l.' : 'Vi\u00f1edos entre 1,500 y 2,200 m.s.n.m.';

    container.innerHTML =
      '<h2>' + titleExtreme + '</h2>' +
      '<p style="color:#777;font-size:14px;margin-bottom:16px;">' + subtitleExtreme + '</p>' +
      '<div class="bodega-list">' + extremeHTML + '</div>' +
      '<hr class="section-divider">' +
      '<h2>' + titleHigh + '</h2>' +
      '<p style="color:#777;font-size:14px;margin-bottom:16px;">' + subtitleHigh + '</p>' +
      '<div class="bodega-list">' + highHTML + '</div>';
  }

  // ===== DYNAMIC EVENTS RENDERING =====
  var eventsContainer = document.getElementById('events-list');
  if (eventsContainer) {
    var evtPath = eventsContainer.dataset.src || '/data/events.json';
    fetch(evtPath)
      .then(function (r) { return r.json(); })
      .then(function (events) {
        renderEvents(events, eventsContainer);
      })
      .catch(function (err) {
        console.error('Error loading events:', err);
        eventsContainer.innerHTML = '<p class="no-events">Error loading events.</p>';
      });
  }

  function renderEvents(events, container) {
    var lang = isEnglish ? 'en' : 'es';
    var today = new Date().toISOString().split('T')[0];

    // Sort by date, upcoming first
    var upcoming = events.filter(function (e) { return e.date >= today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    var past = events.filter(function (e) { return e.date < today; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });

    if (upcoming.length === 0 && past.length === 0) {
      container.innerHTML = '<p class="no-events">' +
        (isEnglish ? 'No events scheduled at this time. Check back soon!' : 'No hay eventos programados en este momento. \u00a1Vuelve pronto!') +
        '</p>';
      return;
    }

    var html = '';

    if (upcoming.length > 0) {
      html += '<h2>' + (isEnglish ? 'Upcoming Events' : 'Pr\u00f3ximos Eventos') + '</h2>';
      html += '<div class="events-list">';
      upcoming.forEach(function (e) { html += eventCardHTML(e, lang); });
      html += '</div>';
    }

    if (past.length > 0) {
      html += '<hr class="section-divider">';
      html += '<h2>' + (isEnglish ? 'Past Events' : 'Eventos Pasados') + '</h2>';
      html += '<div class="events-list">';
      past.slice(0, 5).forEach(function (e) { html += eventCardHTML(e, lang); });
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function eventCardHTML(e, lang) {
    var title = e['title_' + lang] || e.title_es || '';
    var desc = e['description_' + lang] || e.description_es || '';
    var dateObj = new Date(e.date + 'T12:00:00');
    var dateStr = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return '<div class="event-card">' +
      '<div class="event-date">' + dateStr + (e.time ? ' \u2022 ' + e.time : '') + '</div>' +
      '<h3>' + title + '</h3>' +
      (e.location ? '<div class="event-location">\ud83d\udccd ' + e.location + '</div>' : '') +
      '<p>' + desc + '</p>' +
      '</div>';
  }

  // ===== CONTACT FORM SUBMISSION =====
  var contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = contactForm.querySelector('button[type="submit"]');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = isEnglish ? 'Sending...' : 'Enviando...';

      // Remove any previous status message
      var oldMsg = contactForm.querySelector('.form-status');
      if (oldMsg) oldMsg.remove();

      var data = {
        name: contactForm.querySelector('[name="name"]').value,
        email: contactForm.querySelector('[name="email"]').value,
        subject: contactForm.querySelector('[name="subject"]').value,
        message: contactForm.querySelector('[name="message"]').value
      };

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        var msg = document.createElement('p');
        msg.className = 'form-status';
        if (result.success) {
          msg.style.color = '#2d8a4e';
          msg.textContent = isEnglish ? 'Message sent successfully! We will get back to you soon.' : 'Mensaje enviado con \u00e9xito. Nos pondremos en contacto pronto.';
          contactForm.reset();
        } else {
          msg.style.color = '#c0392b';
          msg.textContent = result.error || (isEnglish ? 'Failed to send. Please try again.' : 'Error al enviar. Intente de nuevo.');
        }
        contactForm.appendChild(msg);
      })
      .catch(function () {
        var msg = document.createElement('p');
        msg.className = 'form-status';
        msg.style.color = '#c0392b';
        msg.textContent = isEnglish ? 'Connection error. Please try again.' : 'Error de conexi\u00f3n. Intente de nuevo.';
        contactForm.appendChild(msg);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = origText;
      });
    });
  }

  // ===== NEWSLETTER FORM SUBMISSION =====
  var newsletterForms = document.querySelectorAll('.newsletter-form');
  newsletterForms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = isEnglish ? 'Subscribing...' : 'Suscribiendo...';

      var oldMsg = form.querySelector('.form-status');
      if (oldMsg) oldMsg.remove();

      var data = {
        name: form.querySelector('[name="name"]').value,
        email: form.querySelector('[name="email"]').value
      };

      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        var msg = document.createElement('p');
        msg.className = 'form-status';
        msg.style.fontSize = '14px';
        msg.style.marginTop = '8px';
        if (result.success) {
          msg.style.color = '#2d8a4e';
          msg.textContent = isEnglish ? 'Subscribed! Thank you.' : '\u00a1Suscrito! Gracias.';
          form.reset();
        } else {
          msg.style.color = '#c0392b';
          msg.textContent = result.error || (isEnglish ? 'Failed. Please try again.' : 'Error. Intente de nuevo.');
        }
        form.appendChild(msg);
      })
      .catch(function () {
        var msg = document.createElement('p');
        msg.className = 'form-status';
        msg.style.color = '#c0392b';
        msg.style.fontSize = '14px';
        msg.style.marginTop = '8px';
        msg.textContent = isEnglish ? 'Connection error.' : 'Error de conexi\u00f3n.';
        form.appendChild(msg);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = origText;
      });
    });
  });

})();
