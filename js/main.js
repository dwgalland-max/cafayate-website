/* ===== Cafayate.com Main JS ===== */

(function () {
  'use strict';

  // Detect language from path
  const isEnglish = window.location.pathname.startsWith('/en/') || window.location.pathname === '/en';

  // ===== LANGUAGE FLAG → TOP BAR =====
  // Move the language toggle from the nav into the always-visible top bar
  var langLink = document.querySelector('.nav-lang-toggle');
  var topBarRight = document.querySelector('.top-bar-right');
  if (langLink && topBarRight) {
    var flagClone = langLink.cloneNode(true);
    flagClone.classList.add('top-bar-lang');
    flagClone.querySelector('img').style.width = '22px';
    flagClone.querySelector('img').style.verticalAlign = 'middle';
    topBarRight.insertBefore(flagClone, topBarRight.firstChild);
    // Remove the flag from the nav to avoid duplication
    var navFlagLi = langLink.closest('li');
    if (navFlagLi) navFlagLi.style.display = 'none';
  }

  // ===== AUTO LANGUAGE DETECTION =====
  // On first visit, redirect to the user's preferred language version
  if (!document.cookie.includes('lang_pref=')) {
    var browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    var prefersEnglish = browserLang.startsWith('en');
    var onSpanishSite = !isEnglish;
    var onEnglishSite = isEnglish;
    // Set cookie so we only do this once (expires in 90 days)
    document.cookie = 'lang_pref=' + (prefersEnglish ? 'en' : 'es') + ';path=/;max-age=7776000;SameSite=Lax';
    // Redirect if mismatch: English browser on Spanish page, or vice versa
    if (prefersEnglish && onSpanishSite) {
      // Redirect to English equivalent
      var enPath = '/en' + window.location.pathname;
      window.location.replace(enPath);
      return;
    } else if (!prefersEnglish && onEnglishSite) {
      // Redirect to Spanish equivalent
      var esPath = window.location.pathname.replace(/^\/en/, '');
      if (esPath === '') esPath = '/';
      window.location.replace(esPath);
      return;
    }
  }

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
        (b.image ? '<img class="bodega-card-img" src="' + b.image + '" alt="' + b.name + '" loading="lazy">' : '') +
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

    // Inject Winery structured data (JSON-LD) for SEO rich snippets
    injectBodegaSchema(bodegas);
  }

  function injectBodegaSchema(bodegas) {
    var lang = isEnglish ? 'en' : 'es';
    var schemaItems = bodegas.map(function (b) {
      var desc = b['description_' + lang] || b.description_es || '';
      var item = {
        '@type': 'Winery',
        'name': b.name,
        'description': desc,
        'address': { '@type': 'PostalAddress', 'addressLocality': 'Cafayate', 'addressRegion': 'Salta', 'addressCountry': 'AR' }
      };
      if (b.lat && b.lng) item.geo = { '@type': 'GeoCoordinates', 'latitude': b.lat, 'longitude': b.lng };
      if (b.website) item.url = b.website;
      return item;
    });

    var schema = { '@context': 'https://schema.org', '@graph': schemaItems };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
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

    if (upcoming.length === 0) {
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


    container.innerHTML = html;

    // Inject Event structured data (JSON-LD) for SEO rich snippets
    injectEventSchema(upcoming);
  }

  function injectEventSchema(events) {
    var lang = isEnglish ? 'en' : 'es';
    var schemaEvents = events.map(function (e) {
      var title = e['title_' + lang] || e.title_es || '';
      var desc = e['description_' + lang] || e.description_es || '';
      var ev = {
        '@type': 'Event',
        'name': title,
        'description': desc,
        'startDate': e.date + (e.time ? 'T' + e.time + ':00' : ''),
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'eventStatus': 'https://schema.org/EventScheduled'
      };
      if (e.location) {
        ev.location = {
          '@type': 'Place',
          'name': e.location,
          'address': { '@type': 'PostalAddress', 'addressLocality': 'Cafayate', 'addressRegion': 'Salta', 'addressCountry': 'AR' }
        };
      }
      if (e.website) ev.url = e.website;
      return ev;
    });

    var schema = { '@context': 'https://schema.org', '@graph': schemaEvents };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
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
      (e.website ? '<a href="' + e.website + '" target="_blank" rel="noopener" class="event-link">' + (isEnglish ? 'More info \u2192' : 'M\u00e1s info \u2192') + '</a>' : '') +
      '</div>';
  }

  // ===== DYNAMIC PROPERTY LISTINGS =====
  var propertiesContainer = document.getElementById('properties-list');
  if (propertiesContainer) {
    var propPath = propertiesContainer.dataset.src || '/data/properties.json';
    fetch(propPath)
      .then(function (r) { return r.json(); })
      .then(function (properties) {
        renderProperties(properties, propertiesContainer);
      })
      .catch(function (err) {
        console.error('Error loading properties:', err);
        propertiesContainer.innerHTML = '<p>' + (isEnglish ? 'Error loading listings.' : 'Error al cargar las propiedades.') + '</p>';
      });
  }

  function renderProperties(properties, container) {
    var lang = isEnglish ? 'en' : 'es';

    if (properties.length === 0) {
      container.innerHTML = '<p>' +
        (isEnglish ? 'No properties listed at this time. Contact us for available options.' : 'No hay propiedades listadas en este momento. Contáctenos para opciones disponibles.') +
        '</p>';
      return;
    }

    var html = '<div class="properties-list">';
    properties.forEach(function (p) {
      var title = p['title_' + lang] || p.title_es || '';
      var type = p['type_' + lang] || p.type_es || '';
      var location = p['location_' + lang] || p.location_es || '';
      var desc = p['description_' + lang] || p.description_es || '';
      var contactText = isEnglish ? 'Contact us' : 'Consultar';

      var statusLabel = '';
      var statusClass = p.status || 'for_sale';
      if (statusClass === 'for_sale') statusLabel = isEnglish ? 'For Sale' : 'En Venta';
      else if (statusClass === 'sold') statusLabel = isEnglish ? 'Sold' : 'Vendido';
      else if (statusClass === 'pending') statusLabel = isEnglish ? 'Under Contract' : 'Reservado';
      statusClass = statusClass.replace('_', '-');

      var imgHTML = p.image
        ? '<img class="property-card-img" src="' + p.image + '" alt="' + title + '">'
        : '<div class="property-card-img-placeholder">' + type + '</div>';

      var metaHTML = '<div class="property-meta">';
      metaHTML += '<span>' + type + '</span>';
      if (p.size) metaHTML += '<span>' + p.size + '</span>';
      if (p.bedrooms > 0) metaHTML += '<span>' + p.bedrooms + ' ' + (isEnglish ? 'bed' : 'dorm') + '</span>';
      if (p.bathrooms > 0) metaHTML += '<span>' + p.bathrooms + ' ' + (isEnglish ? 'bath' : 'baño') + '</span>';
      if (location) metaHTML += '<span>' + location + '</span>';
      metaHTML += '</div>';

      html += '<div class="property-card">' +
        imgHTML +
        '<div class="property-card-info">' +
        '<div class="property-card-header">' +
        '<h3>' + title + '</h3>' +
        '<span class="property-badge ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="property-price">' + (p.price || '') + '</div>' +
        metaHTML +
        '<p>' + desc + '</p>' +
        (p.website ? '<a class="property-website" href="' + p.website + '" target="_blank" rel="noopener">' + (isEnglish ? 'View listing' : 'Ver listado') + ' &rarr;</a> ' : '') +
        (p.contact_email ? '<a class="property-contact" href="mailto:' + p.contact_email + '?subject=' + encodeURIComponent(title) + '">' + contactText + ' &rarr;</a> ' : '') +
        (p.contact_phone ? '<a class="property-contact" href="tel:' + p.contact_phone.replace(/[^+\d]/g, '') + '">Tel: ' + p.contact_phone + '</a>' : '') +
        '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
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
        message: contactForm.querySelector('[name="message"]').value,
        website: contactForm.querySelector('[name="website"]') ? contactForm.querySelector('[name="website"]').value : ''
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

  // ===== INTERACTIVE BODEGA MAP (Leaflet) =====
  var mapContainer = document.getElementById('bodega-map');
  if (mapContainer && typeof L !== 'undefined') {
    var map = L.map('bodega-map').setView([-26.0724, -65.9749], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(map);

    // Custom marker icons
    var redIcon = L.divIcon({
      className: 'bodega-marker',
      html: '<div style="background:#c0392b;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">\ud83c\udf77</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });

    var greenIcon = L.divIcon({
      className: 'bodega-marker',
      html: '<div style="background:#1e6a3a;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">\ud83c\udf77</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });

    fetch('/data/bodegas.json')
      .then(function (r) { return r.json(); })
      .then(function (bodegas) {
        var lang = isEnglish ? 'en' : 'es';
        bodegas.forEach(function (b) {
          if (!b.lat || !b.lng) return;
          var desc = b['description_' + lang] || b.description_es || '';
          var altLabel = isEnglish ? 'm.a.s.l.' : 'm.s.n.m.';
          var altRange = b.altitudeMax ? (b.altitude + ' - ' + b.altitudeMax) : b.altitude;
          var websiteLink = b.website
            ? '<a class="map-popup-link" href="' + b.website + '" target="_blank" rel="noopener">' + (isEnglish ? 'Visit website' : 'Sitio web') + ' \u2192</a>'
            : '';
          var popup = '<div class="map-popup-name">' + b.name + '</div>' +
            '<div class="map-popup-alt">' + altRange + ' ' + altLabel + '</div>' +
            '<div class="map-popup-desc">' + desc + '</div>' +
            websiteLink;
          // Red marker for Bad Brothers (sponsor) and extreme altitude; green for others
          var isSponsor = b.name.indexOf('Bad Brothers') !== -1;
          var icon = (isSponsor || b.category === 'extreme') ? redIcon : greenIcon;
          L.marker([b.lat, b.lng], { icon: icon }).addTo(map).bindPopup(popup);
        });
      })
      .catch(function (err) {
        console.error('Error loading bodegas for map:', err);
      });
  }

  // ===== HOMEPAGE MINI MAP =====
  var homeMapContainer = document.getElementById('home-map');
  if (homeMapContainer && typeof L !== 'undefined') {
    var homeMap = L.map('home-map', { scrollWheelZoom: false }).setView([-26.0724, -65.9749], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(homeMap);

    var hmRedIcon = L.divIcon({
      className: 'bodega-marker',
      html: '<div style="background:#c0392b;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">\ud83c\udf77</div>',
      iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14]
    });
    var hmGreenIcon = L.divIcon({
      className: 'bodega-marker',
      html: '<div style="background:#1e6a3a;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">\ud83c\udf77</div>',
      iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14]
    });

    fetch('/data/bodegas.json')
      .then(function (r) { return r.json(); })
      .then(function (bodegas) {
        var lugaresUrl = isEnglish ? '/en/pages/lugares.html' : '/pages/lugares.html';
        bodegas.forEach(function (b) {
          if (!b.lat || !b.lng) return;
          var isSponsor = b.name.indexOf('Bad Brothers') !== -1;
          var icon = (isSponsor || b.category === 'extreme') ? hmRedIcon : hmGreenIcon;
          L.marker([b.lat, b.lng], { icon: icon }).addTo(homeMap)
            .bindPopup('<strong>' + b.name + '</strong><br><a href="' + lugaresUrl + '">' + (isEnglish ? 'View full map' : 'Ver mapa completo') + ' \u2192</a>');
        });
      });
  }

  // ===== DYNAMIC PROMO RENDERING =====
  var promoSlots = document.querySelectorAll('[data-promo]');
  if (promoSlots.length > 0) {
    fetch('/data/promos.json')
      .then(function (r) { return r.json(); })
      .then(function (promos) {
        var lang = isEnglish ? 'en' : 'es';
        promoSlots.forEach(function (slot) {
          var position = slot.dataset.promo;
          var promo = promos.find(function (p) { return p.position === position && p.active; });
          if (!promo) return;

          var alt = promo['alt_' + lang] || promo.alt_es || '';
          var label = promo['label_' + lang] || promo.label_es || '';
          var caption = promo['caption_' + lang] || promo.caption_es || '';

          if (position === 'sidebar') {
            // Professional full-bleed sidebar ad card
            var logoHTML = promo.logo
              ? '<img src="' + promo.logo + '" alt="Bad Brothers" class="promo-sidebar-logo">'
              : '';
            slot.innerHTML =
              '<div class="promo-box promo-box-sidebar">' +
              '<a href="' + promo.link + '" target="_blank" rel="noopener">' +
              '<div class="promo-sidebar-card">' +
              '<img src="' + promo.image + '" alt="' + alt + '" class="promo-sidebar-bg" loading="lazy">' +
              '<div class="promo-sidebar-overlay">' +
              '<div class="promo-sidebar-content">' +
              logoHTML +
              '</div>' +
              '<div class="promo-sidebar-sponsor">' + label + '</div>' +
              '</div>' +
              '</div>' +
              '</a></div>';
          } else {
            // Banner promo (wide)
            var sponsorHTML = '';
            if (promo.sponsor) {
              var name = promo.sponsor;
              var bbIndex = name.indexOf('Bad Brothers');
              if (bbIndex !== -1) {
                var before = name.substring(0, bbIndex);
                var after = name.substring(bbIndex + 12);
                sponsorHTML = '<div class="promo-sponsor">' +
                  (before ? '<span>' + before + '</span>' : '') +
                  '<span class="promo-sponsor-name">Bad Brothers</span>' +
                  (after ? '<span class="promo-sponsor-sub">' + after.replace(/^\s+/, '') + '</span>' : '') +
                  '</div>';
              } else {
                sponsorHTML = '<div class="promo-sponsor">' + name + '</div>';
              }
            }
            slot.innerHTML =
              '<div class="promo-box promo-box-wide">' +
              '<div class="promo-label">' + label + '</div>' +
              '<a href="' + promo.link + '" target="_blank" rel="noopener">' +
              '<img src="' + promo.image + '" alt="' + alt + '" loading="lazy">' +
              sponsorHTML +
              (caption ? '<div class="promo-caption">' + caption + '</div>' : '') +
              '</a></div>';
          }
        });
      })
      .catch(function (err) {
        console.error('Error loading promos:', err);
      });
  }

})();
