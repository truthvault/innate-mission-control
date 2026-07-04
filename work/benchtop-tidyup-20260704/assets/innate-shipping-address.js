(function () {
  'use strict';

  var API_BASE = 'https://innate-mission-control.vercel.app';
  var MIN_QUERY_LEN = 3;
  var DEBOUNCE_MS = 220;

  function freshSession() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function init(el) {
    if (el.dataset.innateShippingInit === '1') return;
    el.dataset.innateShippingInit = '1';

    var input = el.querySelector('.innate-shipping-address__input');
    var dropdown = el.querySelector('.innate-shipping-address__dropdown');
    var status = el.querySelector('.innate-shipping-address__status');
    if (!input || !dropdown) return;

    var session = freshSession();
    var predictions = [];
    var active = -1;
    var abortController = null;
    var debounceHandle = null;

    function setStatus(text, isError) {
      if (!status) return;
      status.textContent = text || '';
      status.classList.toggle('innate-shipping-address__status--error', !!isError);
    }

    function renderDropdown() {
      while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
      if (predictions.length === 0) {
        dropdown.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      predictions.forEach(function (p, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.className = 'innate-shipping-address__opt' + (i === active ? ' is-active' : '');
        li.setAttribute('aria-selected', i === active ? 'true' : 'false');
        var main = document.createElement('span');
        main.className = 'innate-shipping-address__main';
        main.textContent = p.mainText;
        var sec = document.createElement('span');
        sec.className = 'innate-shipping-address__sec';
        sec.textContent = p.secondaryText;
        li.appendChild(main);
        li.appendChild(sec);
        li.addEventListener('mousedown', function (e) {
          // mousedown fires before blur/outside-click closes the list
          e.preventDefault();
          pick(p);
        });
        li.addEventListener('mouseenter', function () {
          if (active === i) return;
          var prev = dropdown.querySelector('.innate-shipping-address__opt.is-active');
          if (prev) {
            prev.classList.remove('is-active');
            prev.setAttribute('aria-selected', 'false');
          }
          li.classList.add('is-active');
          li.setAttribute('aria-selected', 'true');
          active = i;
        });
        dropdown.appendChild(li);
      });
      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function fetchPredictions(q) {
      if (abortController) abortController.abort();
      abortController = new AbortController();
      setStatus('Searching…', false);
      fetch(
        API_BASE + '/api/address-autocomplete?q=' + encodeURIComponent(q) + '&session=' + encodeURIComponent(session),
        { signal: abortController.signal }
      )
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (!r.ok) {
            setStatus(r.data && r.data.error ? r.data.error : 'Address search unavailable', true);
            predictions = [];
            renderDropdown();
            return;
          }
          predictions = (r.data && r.data.predictions) || [];
          active = -1;
          setStatus('', false);
          renderDropdown();
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          setStatus('Address search failed', true);
          predictions = [];
          renderDropdown();
        });
    }

    function pick(p) {
      input.value = p.text;
      predictions = [];
      active = -1;
      renderDropdown();
      // Reset session — autocomplete → details was one billable session.
      var pickedSession = session;
      session = freshSession();
      setStatus('', false);

      fetch(
        API_BASE + '/api/address-details?place_id=' + encodeURIComponent(p.id) + '&session=' + encodeURIComponent(pickedSession)
      )
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (!r.ok || !r.data || r.data.lat == null || r.data.lng == null) return;
          // Stash for the future shipping-calc wiring.
          el.dataset.lat = String(r.data.lat);
          el.dataset.lng = String(r.data.lng);
          el.dataset.formatted = r.data.formatted || p.text;
          el.dataset.placeId = p.id;
          el.dispatchEvent(new CustomEvent('innate:address-picked', {
            detail: {
              lat: r.data.lat,
              lng: r.data.lng,
              formatted: r.data.formatted || p.text,
              placeId: p.id
            },
            bubbles: true
          }));
        })
        .catch(function () { /* details failure is non-fatal for the UX today */ });
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (debounceHandle) clearTimeout(debounceHandle);
      if (q.length < MIN_QUERY_LEN) {
        predictions = [];
        active = -1;
        setStatus('', false);
        renderDropdown();
        return;
      }
      debounceHandle = setTimeout(function () {
        if (input.value.trim() === q) fetchPredictions(q);
      }, DEBOUNCE_MS);
    });

    input.addEventListener('focus', function () {
      if (predictions.length > 0) renderDropdown();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active = Math.min(active + 1, predictions.length - 1);
        renderDropdown();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(active - 1, -1);
        renderDropdown();
      } else if (e.key === 'Enter') {
        if (active >= 0 && predictions[active]) {
          e.preventDefault();
          pick(predictions[active]);
        }
      } else if (e.key === 'Escape') {
        predictions = [];
        active = -1;
        renderDropdown();
        input.blur();
      }
    });

    document.addEventListener('mousedown', function (e) {
      if (!el.contains(e.target)) {
        predictions = [];
        active = -1;
        renderDropdown();
      }
    });
  }

  function bootstrap() {
    var nodes = document.querySelectorAll('[data-component="innate-shipping-address"]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

/* Innate dining enquiry form safety guard — 2026-05-11
   Removes a stale multipart enctype left by cached inline dining-page JS.
   Safe to remove after Shopify storefront cache has fully cleared. */
(function () {
  function fixDiningContactFormEncoding() {
    var form = document.querySelector('#dining-contact-form form');
    if (!form) return;
    if (form.getAttribute('enctype') === 'multipart/form-data') {
      form.removeAttribute('enctype');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixDiningContactFormEncoding);
  } else {
    fixDiningContactFormEncoding();
  }
  window.addEventListener('load', fixDiningContactFormEncoding);
  document.addEventListener('submit', function (event) {
    if (event.target && event.target.matches && event.target.matches('#dining-contact-form form')) {
      fixDiningContactFormEncoding();
    }
  }, true);
})();
