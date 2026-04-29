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

  // (Auto language redirect removed — was overriding the user's URL choice and
  // causing surprise switches between ES and EN. The flag toggle in the top bar
  // gives users explicit control to switch.)

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

  // ===== DYNAMIC BLOG RENDERING =====
  var blogContainer = document.getElementById('blog-list');
  if (blogContainer) {
    var blogPath = blogContainer.dataset.src || '/data/blog.json';
    fetch(blogPath)
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        renderBlogPosts(posts, blogContainer);
      })
      .catch(function (err) {
        console.error('Error loading blog posts:', err);
        blogContainer.innerHTML = '<p class="no-events">' +
          (isEnglish ? 'Error loading blog posts.' : 'Error al cargar las entradas del blog.') + '</p>';
      });
  }

  function renderBlogPosts(posts, container) {
    var lang = isEnglish ? 'en' : 'es';

    // Check if we're viewing a single post (hash-based routing)
    var hash = window.location.hash.replace('#', '');
    if (hash) {
      var post = posts.find(function (p) { return p.slug === hash; });
      if (post) {
        renderSinglePost(post, container, lang, posts);
        injectBlogSchema([post]);
        return;
      }
    }

    // Sort: pinned posts first, then by date descending (newest first)
    var sorted = posts.slice().sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.date.localeCompare(a.date);
    });

    if (sorted.length === 0) {
      container.innerHTML = '<p class="no-events">' +
        (isEnglish ? 'No blog posts yet. Check back soon!' : 'No hay entradas en el blog a\u00fan. \u00a1Volv\u00e9 pronto!') +
        '</p>';
      return;
    }

    var html = '<div class="blog-list">';
    sorted.forEach(function (post) {
      html += blogCardHTML(post, lang);
    });
    html += '</div>';

    container.innerHTML = html;

    // Add click handlers for blog cards
    container.querySelectorAll('.blog-card-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var slug = this.dataset.slug;
        window.location.hash = slug;
        var post = posts.find(function (p) { return p.slug === slug; });
        if (post) {
          renderSinglePost(post, container, lang, posts);
          injectBlogSchema([post]);
          window.scrollTo({ top: container.offsetTop - 80, behavior: 'smooth' });
        }
      });
    });

    // Inject structured data for all posts
    injectBlogSchema(sorted);
  }

  function blogCardHTML(post, lang) {
    var title = post['title_' + lang] || post.title_es || '';
    var desc = post['description_' + lang] || post.description_es || '';
    var dateObj = new Date(post.date + 'T12:00:00');
    var dateStr = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    var categoryLabels = {
      wine: { es: 'Vinos', en: 'Wine' },
      travel: { es: 'Viajes', en: 'Travel' },
      culture: { es: 'Cultura', en: 'Culture' }
    };
    var catLabel = categoryLabels[post.category] ? categoryLabels[post.category][lang] : (post.category || '');

    var pinnedLabel = post.pinned ? '<span class="blog-card-pinned">' + (isEnglish ? 'Featured' : 'Destacado') + '</span>' : '';

    return '<article class="blog-card' + (post.pinned ? ' blog-card-pinned-post' : '') + '">' +
      '<a href="#' + post.slug + '" class="blog-card-link" data-slug="' + post.slug + '">' +
      (post.image ? '<img class="blog-card-img" src="' + post.image + '" alt="' + title + '" loading="lazy"' + (post.image_position ? ' style="object-position:' + post.image_position + '"' : '') + '>' : '') +
      '<div class="blog-card-body">' +
      '<div class="blog-card-meta">' +
      pinnedLabel +
      '<span class="blog-card-date">' + dateStr + '</span>' +
      (catLabel ? '<span class="blog-card-category">' + catLabel + '</span>' : '') +
      '</div>' +
      '<h3>' + title + '</h3>' +
      '<p>' + desc + '</p>' +
      '<span class="blog-card-readmore">' + (isEnglish ? 'Read more \u2192' : 'Leer m\u00e1s \u2192') + '</span>' +
      '</div>' +
      '</a></article>';
  }

  function renderSinglePost(post, container, lang, allPosts) {
    var title = post['title_' + lang] || post.title_es || '';
    var content = post['content_' + lang] || post.content_es || '';
    var dateObj = new Date(post.date + 'T12:00:00');
    var dateStr = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    var categoryLabels = {
      wine: { es: 'Vinos', en: 'Wine' },
      travel: { es: 'Viajes', en: 'Travel' },
      culture: { es: 'Cultura', en: 'Culture' }
    };
    var catLabel = categoryLabels[post.category] ? categoryLabels[post.category][lang] : '';

    var backLabel = isEnglish ? '\u2190 Back to Blog' : '\u2190 Volver al Blog';

    var html = '<div class="blog-single">' +
      '<a href="#" class="blog-back-link" id="blog-back">' + backLabel + '</a>' +
      (post.image ? '<img class="blog-single-img" src="' + post.image + '" alt="' + title + '">' : '') +
      '<div class="blog-single-meta">' +
      '<span class="blog-card-date">' + dateStr + '</span>' +
      (catLabel ? '<span class="blog-card-category">' + catLabel + '</span>' : '') +
      '</div>' +
      '<h2 class="blog-single-title">' + title + '</h2>' +
      '<div class="blog-single-content">' + content + '</div>' +
      '</div>';

    container.innerHTML = html;

    // Update page title
    document.title = title + ' - CAFAYATE.com';

    // Back button handler
    var backBtn = document.getElementById('blog-back');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.hash = '';
        renderBlogPosts(allPosts, container);
        document.title = 'Blog - CAFAYATE.com';
      });
    }
  }

  function injectBlogSchema(posts) {
    var lang = isEnglish ? 'en' : 'es';
    var schemaItems = posts.map(function (p) {
      var title = p['title_' + lang] || p.title_es || '';
      var desc = p['description_' + lang] || p.description_es || '';
      return {
        '@type': 'BlogPosting',
        'headline': title,
        'description': desc,
        'datePublished': p.date,
        'author': { '@type': 'Organization', 'name': p.author || 'Cafayate.com' },
        'publisher': { '@type': 'Organization', 'name': 'CAFAYATE.com', 'url': 'https://cafayate.com' },
        'image': p.image ? 'https://cafayate.com' + p.image : undefined,
        'url': 'https://cafayate.com/' + (isEnglish ? 'en/' : '') + 'pages/blog#' + p.slug
      };
    });

    var schema = { '@context': 'https://schema.org', '@graph': schemaItems };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }

  // Handle browser back/forward for blog posts
  window.addEventListener('hashchange', function () {
    var bc = document.getElementById('blog-list');
    if (bc) {
      var blogDataPath = bc.dataset.src || '/data/blog.json';
      fetch(blogDataPath)
        .then(function (r) { return r.json(); })
        .then(function (posts) {
          renderBlogPosts(posts, bc);
        });
    }
  });

  // (Removed: dynamic property listings renderer. The propiedad page now uses
  // a static 3-card directory of realtors instead of fetching properties.json.)

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
    // Record when form was loaded for bot timing check
    form.setAttribute('data-loaded', Date.now().toString());

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = isEnglish ? 'Subscribing...' : 'Suscribiendo...';

      var oldMsg = form.querySelector('.form-status');
      if (oldMsg) oldMsg.remove();

      // Honeypot check — if the hidden "website" field is filled, it's a bot
      var honeypot = form.querySelector('[name="website"]');
      if (honeypot && honeypot.value) {
        var msg = document.createElement('p');
        msg.className = 'form-status';
        msg.style.fontSize = '14px';
        msg.style.marginTop = '8px';
        msg.style.color = '#2d8a4e';
        msg.textContent = isEnglish ? 'Subscribed! Thank you.' : '\u00a1Suscrito! Gracias.';
        form.appendChild(msg);
        btn.disabled = false;
        btn.textContent = origText;
        return; // Silently reject — bot thinks it worked
      }

      // Timing check — form submitted in under 3 seconds is likely a bot
      var loadedAt = parseInt(form.getAttribute('data-loaded') || '0');
      var elapsed = Date.now() - loadedAt;

      var data = {
        name: form.querySelector('[name="name"]').value,
        email: form.querySelector('[name="email"]').value,
        lang: window.location.pathname.indexOf('/en/') === 0 ? 'en' : 'es',
        _t: elapsed
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

  // Shuffle photo-grid figures so gallery feels fresh every visit
  var photoGrid = document.querySelector('.photo-grid');
  if (photoGrid) {
    var figures = Array.prototype.slice.call(photoGrid.children);
    for (var i = figures.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = figures[i];
      figures[i] = figures[j];
      figures[j] = tmp;
    }
    figures.forEach(function (fig) { photoGrid.appendChild(fig); });
  }

  // ===== SPONSOR CLICK TRACKING (GA4 custom event) =====
  // Any anchor tagged with data-sponsor (e.g. Bad Brothers banners and listing cards)
  // fires a 'sponsor_click' event with sponsor + placement params, so we can attribute
  // outbound clicks per ad placement rather than just per-domain.
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest && e.target.closest('a[data-sponsor]');
    if (!anchor) return;
    if (typeof window.gtag !== 'function') return; // gtag blocked or not yet loaded
    try {
      window.gtag('event', 'sponsor_click', {
        sponsor: anchor.getAttribute('data-sponsor') || 'unknown',
        placement: anchor.getAttribute('data-placement') || 'unknown',
        link_url: anchor.href,
        page_path: window.location.pathname
      });
    } catch (err) {
      // Tracking should never break the user's click-through
    }
  });

})();
