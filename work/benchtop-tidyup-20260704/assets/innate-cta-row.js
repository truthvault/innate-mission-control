(function () {
  'use strict';

  function wrap() {
    var buyRow = document.querySelector('.row.type_buy_buttons');
    if (!buyRow) return;
    if (buyRow.parentNode && buyRow.parentNode.classList.contains('innate-cta-row')) return;

    // Per the dining-table template, the Contact Us button block sits as the
    // next .row sibling immediately after buy_buttons. Walk forward past any
    // whitespace or comment nodes to find the next .row.
    var sibling = buyRow.nextElementSibling;
    while (sibling && !(sibling.classList && sibling.classList.contains('row'))) {
      sibling = sibling.nextElementSibling;
    }
    if (!sibling) return;
    if (!sibling.querySelector('a[href="/pages/contact"]')) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'innate-cta-row';
    buyRow.parentNode.insertBefore(wrapper, buyRow);
    wrapper.appendChild(buyRow);
    wrapper.appendChild(sibling);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap);
  } else {
    wrap();
  }
})();
