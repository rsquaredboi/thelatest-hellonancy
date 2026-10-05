/* Carry the visitor's campaign through article links and into the Nancy store. */
(function () {
  'use strict';

  var storageKey = 'thelatest_attribution_v1';
  var trackingKeys = Object.create(null);
  [
    'fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'gclsrc', 'gad_source',
    'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'sccid', 'sc_click_id',
    'rdt_cid', 'epik', 'obclid', 'tblci', 'taboola_click_id', 'irclickid',
    'campaign_id', 'campaignid', 'campaign_name', 'adset_id', 'adsetid',
    'adset_name', 'ad_id', 'adid', 'ad_name', 'adgroup_id', 'adgroupid',
    'ad_group_id', 'creative_id', 'creativeid', 'placement', 'site_source_name',
    'source_id', 'h_ad_id', '_fbc', '_fbp', 'fbc', 'fbp', 'ref', 'affiliate'
  ].forEach(function (key) { trackingKeys[key] = true; });

  function isTrackingKey(key) {
    var normalized = key.toLowerCase();
    return normalized.indexOf('utm_') === 0 || trackingKeys[normalized] === true;
  }

  function collect(search) {
    var result = Object.create(null);
    var count = 0;
    new URLSearchParams(search).forEach(function (value, key) {
      var normalized = key.toLowerCase();
      if (count >= 48 || key.length > 64 || value.length > 2048 || !value.trim()) return;
      if (!isTrackingKey(key) || Object.prototype.hasOwnProperty.call(result, normalized)) return;
      result[normalized] = value;
      count += 1;
    });
    return result;
  }

  function storedParams() {
    try {
      var parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.create(null);
      var query = new URLSearchParams();
      Object.keys(parsed).forEach(function (key) {
        if (typeof parsed[key] === 'string') query.append(key, parsed[key]);
      });
      return collect(query);
    } catch (error) {
      return Object.create(null);
    }
  }

  var incoming = collect(window.location.search);
  // A new campaign replaces the whole group, including old click and ad ids.
  var attribution = Object.keys(incoming).length ? incoming : storedParams();
  if (!Object.keys(attribution).length) return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(attribution));
  } catch (error) {
    // Storage may be disabled; the current URL can still supply attribution.
  }

  function isEligible(url) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    var host = url.hostname.toLowerCase();
    if (host !== 'hellonancy.com' && !host.endsWith('.hellonancy.com')) return false;
    if (url.username || url.password) return false;
    return !/\/(?:policies|privacy(?:-policy)?|terms(?:-of-service)?|refund-policy|shipping-policy)(?:\/|$)/i.test(url.pathname);
  }

  function patch(anchor) {
    var href = anchor.getAttribute('href');
    if (!href || href.trim().charAt(0) === '#') return;
    try {
      var url = new URL(href, window.location.href);
      if (!isEligible(url)) return;
      // Editorial defaults describe a direct visit. Do not mix them with an ad
      // campaign whose content/term or other attribution fields are absent.
      Array.from(url.searchParams.keys()).forEach(function (key) {
        if (isTrackingKey(key)) url.searchParams.delete(key);
      });
      Object.keys(attribution).forEach(function (key) {
        url.searchParams.set(key, attribution[key]);
      });
      var patched = url.toString();
      if (patched !== href) anchor.setAttribute('href', patched);
    } catch (error) {
      // A malformed authored link must not stop other links from being patched.
    }
  }

  function patchTree(root) {
    if (root.nodeType === 1 && root.matches('a[href]')) patch(root);
    if (root.querySelectorAll) root.querySelectorAll('a[href]').forEach(patch);
  }

  // Real hrefs support keyboard activation, copied links and opening new tabs.
  patchTree(document);
  document.addEventListener('DOMContentLoaded', function () { patchTree(document); });
  ['click', 'auxclick', 'contextmenu'].forEach(function (eventName) {
    document.addEventListener(eventName, function (event) {
      var target = event.target;
      if (target && target.nodeType !== 1) target = target.parentElement;
      var anchor = target && target.closest ? target.closest('a[href]') : null;
      if (anchor) patch(anchor);
    }, true);
  });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') patch(mutation.target);
        else mutation.addedNodes.forEach(patchTree);
      });
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href']
    });
  }
})();
