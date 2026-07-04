/* Innate benchtop funnel tracking — preview candidate 2026-06-25. Adds dedicated benchtop_quote_submit success event.
   Non-invasive listener script: does not modify configurator state or customer-visible UI. */
(function () {
  if (window.__innateBenchtopFunnelTrackingLoaded) return;
  window.__innateBenchtopFunnelTrackingLoaded = true;

  var PAGE_PATH = window.location.pathname;
  var ROOT_SELECTOR = '#innate-benchtop-configurator';
  var started = false;
  var viewed = false;
  var quoteModalOpen = false;
  var lastPath = '';
  var lastSubmitContext = null;

  function clean(params) {
    var out = {};
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') out[key] = value;
    });
    return out;
  }

  function track(name, params) {
    var payload = clean(Object.assign({
      event_category: 'benchtop_configurator',
      page_path: PAGE_PATH
    }, params || {}));

    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, payload));
    } catch (error) {}

    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, Object.assign({ send_to: 'G-LTMM88LTFZ' }, payload));
    } catch (error) {}

    try {
      if (
        typeof window.clarity === 'function'
        && (name === 'benchtop_estimate_reviewed' || name === 'benchtop_quote_opened' || name === 'benchtop_quote_submit')
      ) {
        window.clarity('event', name);
      }
    } catch (error) {}

    try {
      document.dispatchEvent(new CustomEvent('innate:' + name, { detail: payload }));
    } catch (error) {}
  }

  function root() {
    return document.querySelector(ROOT_SELECTOR);
  }

  function withinRoot(target) {
    return !!(target && target.closest && target.closest(ROOT_SELECTOR));
  }

  function quoteNo() {
    var el = document.querySelector(ROOT_SELECTOR + ' .mast__quote-no');
    return el ? el.textContent.trim() : undefined;
  }

  function totalValue() {
    var amountEl = document.querySelector(ROOT_SELECTOR + ' .stickybar__amount');
    var amount = amountEl ? Number(amountEl.textContent.replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(amount) ? amount : undefined;
  }

  function totalBucket() {
    var amount = totalValue();
    if (!Number.isFinite(amount)) return undefined;
    if (amount < 1000) return 'under_1000';
    if (amount < 2500) return '1000_2499';
    if (amount < 5000) return '2500_4999';
    if (amount < 10000) return '5000_9999';
    return '10000_plus';
  }

  function selectedText(selector) {
    var checked = document.querySelector(ROOT_SELECTOR + ' ' + selector + '[aria-checked="true"], ' + ROOT_SELECTOR + ' ' + selector + '.is-on, ' + ROOT_SELECTOR + ' ' + selector + ':checked');
    if (!checked) return undefined;
    return (checked.getAttribute('aria-label') || checked.textContent || checked.value || '').replace(/\s+/g, ' ').trim();
  }

  function timberSpecies() {
    var label = selectedText('.timber-tile');
    if (!label) return undefined;
    if (/rimu/i.test(label)) return 'West Coast Rimu';
    if (/tōtara|totara/i.test(label)) return 'Northland Tōtara';
    if (/beech/i.test(label)) return 'West Coast Beech';
    return label;
  }

  function finishLabel() {
    var label = selectedText('.material-card__seg-btn');
    if (!label) return undefined;
    if (/raw/i.test(label)) return 'Raw';
    if (/oil/i.test(label)) return 'Oiled';
    return label;
  }

  function panelCount() {
    return document.querySelectorAll(ROOT_SELECTOR + ' .panel-row').length || undefined;
  }

  function hasCutouts() {
    return !!document.querySelector(ROOT_SELECTOR + ' .cutout-item, ' + ROOT_SELECTOR + ' [aria-label^="Cutout "]');
  }

  function shippingKind() {
    var pickup = document.querySelector(ROOT_SELECTOR + ' .stickybar__finish-btn[aria-checked="true"]');
    if (!pickup) return 'unset';
    var text = pickup.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.indexOf('pick up') !== -1) return 'pickup';
    if (text.indexOf('deliver') !== -1) return 'delivering_or_delivered';
    return text || 'selected';
  }

  function context(extra) {
    return Object.assign({
      quote_no: quoteNo(),
      grand_total_bucket: totalBucket(),
      quote_total: totalValue(),
      currency: 'NZD',
      timber_species: timberSpecies(),
      finish: finishLabel(),
      panel_count: panelCount(),
      has_cutouts: hasCutouts(),
      delivery_method: shippingKind(),
      shipping_kind: shippingKind()
    }, extra || {});
  }

  function markStart(firstAction) {
    if (started) return;
    started = true;
    track('benchtop_configurator_start', {
      first_action: firstAction,
      quote_no: quoteNo()
    });
  }

  function classifyButton(button) {
    var aria = button.getAttribute('aria-label') || '';
    var text = button.textContent.replace(/\s+/g, ' ').trim();
    var all = (aria + ' ' + text).toLowerCase();
    if (button.classList.contains('timber-tile')) return 'timber';
    if (button.classList.contains('material-card__seg-btn')) return 'finish';
    if (button.classList.contains('stickybar__finish-btn')) return 'delivery';
    if (button.classList.contains('stickybar__cta')) return 'estimate_reviewed';
    if (button.classList.contains('panel-editor__add')) return 'panel_added';
    if (all.indexOf('increase cut-out') !== -1 || all.indexOf('increase cutout') !== -1) return 'cutout_added';
    if (all.indexOf('length') !== -1 || all.indexOf('width') !== -1 || all.indexOf('thickness') !== -1 || all.indexOf('qty') !== -1 || all.indexOf('quantity') !== -1) return 'size_changed';
    return 'interaction';
  }

  function observeView() {
    var el = root();
    if (!el || viewed) return;
    function fire() {
      if (viewed) return;
      viewed = true;
      track('benchtop_configurator_view', {
        surface: 'embedded',
        device_hint: window.matchMedia('(max-width: 959px)').matches ? 'mobile_or_tablet' : 'desktop',
        quote_no: quoteNo()
      });
    }
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.05) {
            fire();
            observer.disconnect();
          }
        });
      }, { threshold: [0.05, 0.2] });
      observer.observe(el);
    } else {
      fire();
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var sampleLink = target && target.closest ? target.closest('a[href*="/products/product-sample"]') : null;
    if (sampleLink) {
      track('benchtop_sample_clicked', { location: withinRoot(sampleLink) ? 'configurator' : 'page', link_url: sampleLink.href });
      return;
    }

    var contactLink = target && target.closest ? target.closest('a[href^="mailto:"], a[href^="tel:"], a[href*="/pages/contact"]') : null;
    if (contactLink) {
      track('benchtop_contact_clicked', { location: withinRoot(contactLink) ? 'configurator' : 'page', link_url: contactLink.href });
      return;
    }

    if (!withinRoot(target)) {
      var pathCard = target && target.closest ? target.closest('.share-path-card, .share-paths button, .share-paths [role="button"]') : null;
      if (pathCard) {
        lastPath = pathCard.textContent.replace(/\s+/g, ' ').trim().toLowerCase().indexOf('email it to myself') !== -1 ? 'self'
          : pathCard.textContent.replace(/\s+/g, ' ').trim().toLowerCase().indexOf('forward') !== -1 ? 'other'
          : 'workshop';
        track('benchtop_quote_path_selected', context({ path: lastPath }));
      }
      return;
    }

    var button = target.closest('button');
    if (!button) return;
    var action = classifyButton(button);
    markStart(action);

    if (action === 'timber') {
      track('benchtop_timber_selected', {
        quote_no: quoteNo(),
        timber_label: button.getAttribute('aria-label') || button.textContent.replace(/\s+/g, ' ').trim()
      });
    } else if (action === 'delivery') {
      track('benchtop_delivery_selected', context({ shipping_kind: button.textContent.replace(/\s+/g, ' ').trim().toLowerCase() }));
    } else if (action === 'cutout_added') {
      track('benchtop_cutout_added', context({}));
    } else if (action === 'size_changed') {
      track('benchtop_size_changed', context({ dimension: (button.getAttribute('aria-label') || button.textContent || 'size').split(',')[0].toLowerCase() }));
    } else if (action === 'estimate_reviewed') {
      var ariaLabel = button.getAttribute('aria-label') || '';
      var blocked = ariaLabel.indexOf('(') !== -1;
      track('benchtop_estimate_reviewed', context({
        can_share: !blocked && !button.disabled,
        block_reason: blocked ? ariaLabel.replace(/^.*\((.*)\).*$/, '$1') : undefined
      }));
    }
  }, true);

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!withinRoot(target)) return;
    if (target.matches('input, select, textarea')) {
      var label = target.closest('label');
      var labelText = label ? label.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : 'input';
      if (/length|width|thickness|qty|quantity/.test(labelText)) {
        markStart('size_changed');
        track('benchtop_size_changed', context({ dimension: labelText.split(' ')[0] }));
      }
    }
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('.quote-form')) return;
    lastSubmitContext = context({ path: lastPath || 'workshop' });
    track('benchtop_quote_submit_attempt', lastSubmitContext);
  }, true);

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var args = arguments;
      var url = String(args[0] && args[0].url ? args[0].url : args[0]);
      var isQuoteSend = url.indexOf('/api/send-quote') !== -1;
      return originalFetch.apply(this, args).then(function (response) {
        if (isQuoteSend) {
          var payload = lastSubmitContext || context({ path: lastPath || 'workshop' });
          if (response && response.ok) {
            track('benchtop_quote_submit', Object.assign({ lead_type: 'benchtop_quote' }, payload));
          } else {
            track('benchtop_quote_send_error', Object.assign({}, payload, { error_kind: response ? 'http_' + response.status : 'unknown' }));
          }
        }
        return response;
      }).catch(function (error) {
        if (isQuoteSend) track('benchtop_quote_send_error', Object.assign({}, lastSubmitContext || context({ path: lastPath || 'workshop' }), { error_kind: 'network_or_exception' }));
        throw error;
      });
    };
  }

  var modalObserver = new MutationObserver(function () {
    var modal = document.querySelector('.innate-bench-modal, .modal');
    if (modal && !quoteModalOpen) {
      quoteModalOpen = true;
      track('benchtop_quote_opened', context({}));
    }
    if (!modal) quoteModalOpen = false;
  });

  function boot() {
    observeView();
    modalObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
