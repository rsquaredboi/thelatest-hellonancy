/**
 * Hello Nancy external-page Triple Pixel + campaign handoff.
 * Vendor bootstrap: @triplewhale/pixel-cli 0.1.3, official headless snippet 2.17.
 * https://kb.triplewhale.com/en/articles/6266255
 * The bootstrap fetches Triple Whale's current runtime; do not relabel its version.
 * twclid is X's click ID. Triple Whale uses tw_source/tw_adid/tw_campaign/tw_adsetid.
 */
(function (w, d) {
  'use strict';
  if (w.NancyTripleWhale) return;

  var STORE = 'hello-nancy-toys.myshopify.com';
  var SESSION_KEY = 'nancy_triplewhale_campaign_v1';
  var KEYS = ('tw_source tw_adid tw_campaign tw_adsetid fbadid gadid fbclid gclid dclid gbraid wbraid gclsrc gad_source gad_campaignid msclkid ttclid twclid li_fat_id sccid sc_click_id rdt_cid epik obclid tblci taboola_click_id irclickid').split(' ');
  var HOSTS = ('hellonancy.com www.hellonancy.com try.hellonancy.com nancyuniverse.com www.nancyuniverse.com feelnancy.com www.feelnancy.com get.officialnancy.com').split(' ');
  var FLOW_HOST = /^(?:get\.|www\.)?nancyflow\.(?:com|co\.uk|ca|co\.nz|de|nl|fr|it|se|dk)$/i;
  var campaign = {};
  var retiredTracking = {};
  var lastPage = w.location.pathname + w.location.search;
  var scheduled = false;
  var stopped = false;
  var consentOverride;

  function allowedKey(key) {
    return KEYS.indexOf(key) !== -1 || /^utm_[a-z0-9_]{1,60}$/.test(key);
  }
  function clean(value) {
    return typeof value === 'string' && value.trim() && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
  }
  function read(search) {
    var result = {};
    new URLSearchParams(search).forEach(function (value, key) {
      if (allowedKey(key) && clean(value) && Object.keys(result).length < 48) result[key] = clean(value);
    });
    return result;
  }
  function consentAllowed() {
    if (w.navigator && w.navigator.globalPrivacyControl === true) return false;
    if (consentOverride !== undefined) return consentOverride;
    try {
      if (w.Cookiebot && w.Cookiebot.consent && w.Cookiebot.consent.marketing === false) return false;
      var privacy = w.Shopify && w.Shopify.customerPrivacy;
      if (privacy && typeof privacy.marketingAllowed === 'function' && !privacy.marketingAllowed()) return false;
    } catch (_) { return false; }
    return true;
  }
  function refreshCampaign() {
    var current = read(w.location.search);
    // A new campaign replaces the full previous campaign, including absent IDs.
    // This prevents mixing a later Google/Meta visit with an old TW ad ID.
    if (Object.keys(current).length) {
      Object.keys(campaign).forEach(function (key) {
        if (current[key] !== campaign[key]) {
          (retiredTracking[key] = retiredTracking[key] || []).push(campaign[key]);
        }
      });
      campaign = current;
      try { if (consentAllowed()) w.sessionStorage.setItem(SESSION_KEY, JSON.stringify(campaign)); } catch (_) {}
    }
  }
  try { campaign = read(new URLSearchParams(JSON.parse(w.sessionStorage.getItem(SESSION_KEY) || '{}')).toString()); } catch (_) {}
  refreshCampaign();

  function decorate(href, depth) {
    if (!consentAllowed()) return href;
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) return href;
    var url;
    try { url = new URL(href, w.location.href); } catch (_) { return href; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return href;
    if (url.origin !== w.location.origin && HOSTS.indexOf(url.hostname.toLowerCase()) === -1 && !FLOW_HOST.test(url.hostname)) return href;
    if (url.origin === w.location.origin && url.pathname === w.location.pathname && url.search === w.location.search && url.hash) return href;
    // Shopify discounts navigate to the nested redirect, so decorate that URL.
    if (/^\/discount\//i.test(url.pathname) && url.searchParams.has('redirect') && !depth) {
      var target = url.searchParams.get('redirect');
      try {
        var nested = new URL(target, url.origin);
        // Do not move campaign information onto an external discount redirect.
        if (nested.origin !== url.origin || nested.username || nested.password) return href;
        var decorated = new URL(decorate(nested.href, 1));
        url.searchParams.set('redirect', target.charAt(0) === '/' ? decorated.pathname + decorated.search + decorated.hash : decorated.href);
        return url.href;
      } catch (_) { return href; }
    }
    Object.keys(retiredTracking).forEach(function (key) {
      if (!campaign[key] && retiredTracking[key].indexOf(url.searchParams.get(key)) !== -1) url.searchParams.delete(key);
    });
    Object.keys(campaign).forEach(function (key) {
      // The original ad's campaign wins over hardcoded advertorial labels.
      // Only marketing keys are collected: variant, quantity, discounts and
      // existing Meta identity handoffs are outside this replacement.
      url.searchParams.set(key, campaign[key]);
    });
    return url.href;
  }
  function patchLink(link) {
    if (!link || !link.getAttribute || link.hasAttribute('download') || link.closest('[data-no-attribution]')) return;
    var before = link.getAttribute('href');
    var after = decorate(before);
    if (after !== before) link.setAttribute('href', after);
  }
  function scan() {
    scheduled = false;
    if (!consentAllowed()) return;
    d.querySelectorAll('a[href],area[href]').forEach(patchLink);
  }
  function schedule() {
    if (!scheduled) { scheduled = true; w.setTimeout(scan, 0); }
  }
  function install() {
    if (!consentAllowed()) return;
    // Shopify/app embeds or another copy already own this page's pixel.
    if (w.TriplePixelsn || typeof w.TriplePixel === 'function') return;
    try {
      window.TriplePixelData={TripleName:"hello-nancy-toys.myshopify.com",ver:"2.17",plat:"SHOPIFY",isHeadless:true},function(W,H,A,L,E,_,B,N){function O(U,T,P,H,R){void 0===R&&(R=!1),H=new XMLHttpRequest,P?(H.open("POST",U,!0),H.setRequestHeader("Content-Type","text/plain")):H.open("GET",U,!0),H.send(JSON.stringify(P||{})),H.onreadystatechange=function(){4===H.readyState&&200===H.status?(R=H.responseText,U.includes("/first")?eval(R):P||(N[B]=R)):(299<H.status||H.status<200)&&T&&!R&&(R=!0,O(U,T-1,P))}}if(N=window,!N[H+"sn"]){N[H+"sn"]=1,L=function(){return Date.now().toString(36)+"_"+Math.random().toString(36)};try{A.setItem(H,1+(0|A.getItem(H)||0)),(E=JSON.parse(A.getItem(H+"U")||"[]")).push({u:location.href,r:document.referrer,t:Date.now(),id:L()}),A.setItem(H+"U",JSON.stringify(E))}catch(e){}var i,m,p;A.getItem('"!nC`')||(_=A,A=N,A[H]||(E=A[H]=function(t,e,a){return void 0===a&&(a=[]),"State"==t?E.s:(W=L(),(E._q=E._q||[]).push([W,t,e].concat(a)),W)},E.s="Installed",E._q=[],E.ch=W,B="configSecurityConfModel",N[B]=1,O("https://conf.config-security.com/model",5),i=L(),m=A[atob("c2NyZWVu")],_.setItem("di_pmt_wt",i),p={id:i,action:"profile",avatar:_.getItem("auth-security_rand_salt_"),time:m[atob("d2lkdGg=")]+":"+m[atob("aGVpZ2h0")],host:A.TriplePixelData.TripleName,plat:A.TriplePixelData.plat,url:window.location.href.slice(0,500),ref:document.referrer,ver:A.TriplePixelData.ver},O("https://api.config-security.com/event",5,p),O("https://api.config-security.com/first?host=hello-nancy-toys.myshopify.com&plat=SHOPIFY",5)))}}("","TriplePixel",localStorage);
    } catch (_) {
      // Tracking/storage failures must never interrupt a customer navigation.
    }
  }
  function syncConsent() {
    var allowed = consentAllowed();
    if (!allowed) {
      campaign = {};
      try { w.sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      if (!stopped && typeof w.TriplePixel === 'function') w.TriplePixel('trackingConsent', false);
      stopped = true;
      return;
    }
    refreshCampaign();
    install();
    if (stopped && typeof w.TriplePixel === 'function') w.TriplePixel('trackingConsent', true);
    stopped = false;
    schedule();
  }
  function routeChanged() {
    var page = w.location.pathname + w.location.search;
    if (page === lastPage) return;
    lastPage = page;
    refreshCampaign();
    if (consentAllowed() && typeof w.TriplePixel === 'function') w.TriplePixel('pageLoad');
    schedule();
  }
  w.NancyTripleWhale = { shop: STORE, decorate: decorate, refresh: function () { refreshCampaign(); schedule(); }, setConsent: function (allowed) { consentOverride = allowed === true; syncConsent(); } };
  // Some compiled landers use window.open from a button rather than an anchor.
  var originalOpen = w.open;
  w.open = function (href) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof href === 'string') args[0] = decorate(href);
    return originalOpen.apply(this, args);
  };
  ['click', 'auxclick', 'contextmenu', 'pointerdown', 'focusin'].forEach(function (name) {
    d.addEventListener(name, function (event) {
      if (!consentAllowed()) return;
      var target = event.target;
      if (target && target.closest) patchLink(target.closest('a[href],area[href]'));
    }, true);
  });
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = w.history[name];
    w.history[name] = function () {
      var result = original.apply(this, arguments);
      routeChanged();
      return result;
    };
  });
  w.addEventListener('popstate', routeChanged);
  w.addEventListener('CookiebotOnAccept', syncConsent);
  w.addEventListener('CookiebotOnDecline', syncConsent);
  d.addEventListener('visitorConsentCollected', syncConsent);
  d.addEventListener('nancy:tracking-consent', function (event) {
    if (event.detail && typeof event.detail.marketing === 'boolean') w.NancyTripleWhale.setConsent(event.detail.marketing);
  });
  if (w.MutationObserver && d.documentElement) {
    new MutationObserver(schedule).observe(d.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', schedule);
  syncConsent();
})(window, document);
