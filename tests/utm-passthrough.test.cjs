const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const script = readFileSync(path.join(root, 'assets/utm-passthrough.js'), 'utf8');
const storageKey = 'thelatest_attribution_v1';
const slugs = [
  'tennis-merch', 'tennis-bracelet', 'retire-the-rose', 'tennis-club-party',
  'playing-tennis', 'power-shot', 'back-massager', 'ace-or-smash',
  'mixed-doubles', 'new-balls-please'
];

function page(html, query = '', stored, blockedStorage = false) {
  const dom = new JSDOM(html, {
    url: `https://thelatest.hellonancy.com/tennis-merch/${query}`,
    runScripts: 'outside-only'
  });
  if (stored !== undefined) dom.window.sessionStorage.setItem(storageKey, stored);
  if (blockedStorage) {
    Object.defineProperty(dom.window, 'sessionStorage', {
      get() { throw new Error('Storage is blocked'); }
    });
  }
  dom.window.eval(script);
  return dom;
}

function params(anchor) {
  return new URL(anchor.href).searchParams;
}

function settle(window) {
  return new Promise(resolve => window.setTimeout(resolve, 0));
}

for (const slug of slugs) {
  test(`${slug}: every store CTA and article link receives the inbound campaign`, () => {
    const html = readFileSync(path.join(root, slug, 'index.html'), 'utf8');
    assert.equal((html.match(/src="\/assets\/utm-passthrough\.js"/g) || []).length, 1);
    assert.doesNotMatch(html, /var incoming = window\.location\.search/);
    const query = '?utm_source=facebook&utm_medium=paid_social&utm_campaign=tennis_ads'
      + '&utm_id=campaign_123&utm_custom=extra&fbclid=click_123'
      + '&campaign_id=campaign_123&adset_id=adset_123&ad_id=ad_123&placement=instagram'
      + '&v=quiet&email=private%40example.com';
    const dom = page(html, query);
    const anchors = [...dom.window.document.querySelectorAll('a[href]')].filter(anchor => {
      if (anchor.getAttribute('href').startsWith('#')) return false;
      const url = new URL(anchor.href);
      return url.hostname === 'hellonancy.com'
        || (url.hostname === 'thelatest.hellonancy.com' && !/privacy|terms|policies/.test(url.pathname));
    });
    assert.ok(anchors.length > 10);
    for (const anchor of anchors) {
      const target = params(anchor);
      assert.equal(target.get('utm_source'), 'facebook', anchor.href);
      assert.equal(target.get('utm_campaign'), 'tennis_ads', anchor.href);
      assert.equal(target.get('utm_id'), 'campaign_123', anchor.href);
      assert.equal(target.get('utm_custom'), 'extra', anchor.href);
      assert.equal(target.get('fbclid'), 'click_123', anchor.href);
      assert.equal(target.get('campaign_id'), 'campaign_123', anchor.href);
      assert.equal(target.get('adset_id'), 'adset_123', anchor.href);
      assert.equal(target.get('ad_id'), 'ad_123', anchor.href);
      assert.equal(target.has('utm_content'), false, anchor.href);
      assert.equal(target.has('utm_term'), false, anchor.href);
      assert.equal(target.has('v'), false, anchor.href);
      assert.equal(target.has('email'), false, anchor.href);
    }
    dom.window.close();
  });

  test(`${slug}: a direct visit keeps the authored campaign defaults`, () => {
    const html = readFileSync(path.join(root, slug, 'index.html'), 'utf8');
    const before = new JSDOM(html, { url: `https://thelatest.hellonancy.com/${slug}/` });
    const expected = [...before.window.document.querySelectorAll('a[href]')]
      .map(anchor => anchor.getAttribute('href'));
    const after = page(html);
    assert.deepEqual([...after.window.document.querySelectorAll('a[href]')]
      .map(anchor => anchor.getAttribute('href')), expected);
    before.window.close();
    after.window.close();
  });
}

test('destination variants, discounts, linker parameters and fragments survive', () => {
  const dom = page('<a href="https://hellonancy.com/products/ace?variant=42&discount=ACE25&_gl=linker&v=authored&utm_source=thelatest&utm_content=sticky#offer">Shop</a>',
    '?utm_source=google&utm_term=a%20b%26c&gclid=google-click&v=quiet&discount=incoming');
  const anchor = dom.window.document.querySelector('a');
  assert.equal(params(anchor).get('variant'), '42');
  assert.equal(params(anchor).get('discount'), 'ACE25');
  assert.equal(params(anchor).get('_gl'), 'linker');
  assert.equal(params(anchor).get('v'), 'authored');
  assert.equal(params(anchor).get('utm_term'), 'a b&c');
  assert.equal(params(anchor).has('utm_content'), false);
  assert.equal(new URL(anchor.href).hash, '#offer');
  dom.window.close();
});

test('only exact Nancy hosts receive attribution and legal or local fragment links stay unchanged', () => {
  const hrefs = [
    '#offer', 'mailto:hello@hellonancy.com', 'tel:+123456789',
    'https://hellonancy.com.evil.invalid/products/ace',
    'https://evilhellonancy.com/products/ace',
    'https://evil.invalid/?next=hellonancy.com',
    'https://hellonancy.com/policies/privacy-policy',
    'https://hellonancy.com/pages/terms-of-service',
    'https://user:password@hellonancy.com/products/ace'
  ];
  const dom = page(hrefs.map(href => `<a href="${href}">Link</a>`).join('')
    + '<a id="trusted" href="https://checkout.hellonancy.com/cart?discount=ACE25">Cart</a>'
    + '<a id="internal" href="/power-shot/?v=b#story">Next story</a>', '?utm_source=meta');
  const anchors = [...dom.window.document.querySelectorAll('a')];
  assert.deepEqual(anchors.slice(0, hrefs.length).map(anchor => anchor.getAttribute('href')), hrefs);
  assert.equal(params(dom.window.document.getElementById('trusted')).get('utm_source'), 'meta');
  assert.equal(params(dom.window.document.getElementById('trusted')).get('discount'), 'ACE25');
  assert.equal(params(dom.window.document.getElementById('internal')).get('utm_source'), 'meta');
  assert.equal(params(dom.window.document.getElementById('internal')).get('v'), 'b');
  dom.window.close();
});

test('same-session navigation retains attribution and a fresh campaign drops all stale fields', () => {
  const html = '<a href="https://hellonancy.com/products/ace?utm_source=thelatest&utm_campaign=editorial&utm_content=sticky">Shop</a>';
  const first = page(html, '?utm_source=meta&utm_campaign=first&utm_content=creative-one&fbclid=meta-click&ad_id=old-ad');
  const stored = first.window.sessionStorage.getItem(storageKey);
  const second = page(html, '', stored);
  assert.equal(params(second.window.document.querySelector('a')).get('utm_campaign'), 'first');
  assert.equal(params(second.window.document.querySelector('a')).get('fbclid'), 'meta-click');
  const third = page(html, '?utm_source=google&utm_campaign=second&gclid=google-click', stored);
  const target = params(third.window.document.querySelector('a'));
  assert.equal(target.get('utm_campaign'), 'second');
  assert.equal(target.get('gclid'), 'google-click');
  for (const stale of ['fbclid', 'ad_id', 'utm_content']) assert.equal(target.has(stale), false);
  assert.deepEqual(JSON.parse(third.window.sessionStorage.getItem(storageKey)), {
    utm_source: 'google', utm_campaign: 'second', gclid: 'google-click'
  });
  for (const dom of [first, second, third]) dom.window.close();
});

test('a paid click with no UTM does not inherit an editorial campaign', () => {
  const dom = page('<a href="https://hellonancy.com/products/ace?utm_source=thelatest&utm_campaign=editorial&utm_content=sticky">Shop</a>', '?fbclid=paid-click');
  assert.deepEqual([...params(dom.window.document.querySelector('a'))], [['fbclid', 'paid-click']]);
  dom.window.close();
});

test('blank campaign parameters keep direct defaults and do not replace a valid saved campaign', () => {
  const html = '<a href="https://hellonancy.com/products/ace?utm_source=thelatest&utm_campaign=editorial&utm_content=sticky">Shop</a>';
  const query = '?utm_source=&utm_campaign=%20%20&fbclid=&ad_id=%09';
  const direct = page(html, query);
  assert.deepEqual([...params(direct.window.document.querySelector('a'))], [
    ['utm_source', 'thelatest'], ['utm_campaign', 'editorial'], ['utm_content', 'sticky']
  ]);
  assert.equal(direct.window.sessionStorage.getItem(storageKey), null);
  const stored = JSON.stringify({ utm_source: 'meta', utm_campaign: 'saved', fbclid: 'saved-click' });
  const returning = page(html, query, stored);
  assert.deepEqual([...params(returning.window.document.querySelector('a'))], [
    ['utm_source', 'meta'], ['utm_campaign', 'saved'], ['fbclid', 'saved-click']
  ]);
  assert.equal(returning.window.sessionStorage.getItem(storageKey), stored);
  direct.window.close();
  returning.window.close();
});

test('the first nonempty duplicate wins and valid parameter values retain their whitespace', () => {
  const dom = page('<a href="https://hellonancy.com/products/ace">Shop</a>',
    '?utm_source=&UTM_Source=meta&utm_source=later&utm_campaign=%20%20'
    + '&utm_campaign=spring&fbclid=&fbclid=real-click&ad_id=%20'
    + '&utm_term=%20valid%20phrase%20&campaign_id=0');
  assert.deepEqual([...params(dom.window.document.querySelector('a'))], [
    ['utm_source', 'meta'], ['utm_campaign', 'spring'], ['fbclid', 'real-click'],
    ['utm_term', ' valid phrase '], ['campaign_id', '0']
  ]);
  dom.window.close();
});

test('dynamic quiz result links and rewritten hrefs are patched before interaction', async () => {
  const dom = page('<div id="quiz-result"></div>', '?utm_source=meta&utm_content=paid-creative&ttclid=tiktok-click');
  const result = dom.window.document.getElementById('quiz-result');
  result.innerHTML = '<a href="https://hellonancy.com/products/smash?utm_source=thelatest&utm_content=quiz_result_smash"><span>Shop SMASH</span></a>';
  await settle(dom.window);
  const anchor = result.querySelector('a');
  assert.equal(params(anchor).get('utm_content'), 'paid-creative');
  anchor.setAttribute('href', 'https://hellonancy.com/products/ace?variant=green&utm_source=default');
  await settle(dom.window);
  assert.equal(params(anchor).get('variant'), 'green');
  assert.equal(params(anchor).get('utm_source'), 'meta');
  dom.window.close();
});

for (const eventName of ['click', 'auxclick', 'contextmenu']) {
  test(`${eventName} patches an href changed immediately before interaction`, () => {
    const dom = page('<a href="https://hellonancy.com/products/ace"><span>Shop</span></a>', '?utm_source=meta&ad_id=123');
    const anchor = dom.window.document.querySelector('a');
    anchor.setAttribute('href', 'https://hellonancy.com/products/smash?discount=SMASH25&utm_source=default');
    anchor.querySelector('span').dispatchEvent(new dom.window.MouseEvent(eventName, { bubbles: true }));
    assert.equal(params(anchor).get('utm_source'), 'meta');
    assert.equal(params(anchor).get('ad_id'), '123');
    assert.equal(params(anchor).get('discount'), 'SMASH25');
    dom.window.close();
  });
}

test('the actual ACE or SMASH quiz reveals an attributed result after all answers', () => {
  const html = readFileSync(path.join(root, 'ace-or-smash/index.html'), 'utf8');
  const dom = page(html, '?utm_source=meta&utm_campaign=quiz-ad&utm_content=creative-123&fbclid=quiz-click');
  const quizScript = [...dom.window.document.querySelectorAll('script')]
    .find(element => element.textContent.includes("var quiz = document.getElementById('quiz')"));
  assert.ok(quizScript);
  dom.window.eval(quizScript.textContent);
  for (const question of dom.window.document.querySelectorAll('.quiz__q')) {
    const options = [...question.querySelectorAll('.quiz__opt')];
    const bestAce = options.sort((a, b) => Number(b.dataset.ace) - Number(a.dataset.ace))[0];
    bestAce.click();
  }
  const result = dom.window.document.querySelector('.quiz__result[data-result="ace"]');
  assert.equal(result.hidden, false);
  assert.equal(params(result.querySelector('a')).get('utm_campaign'), 'quiz-ad');
  assert.equal(params(result.querySelector('a')).get('utm_content'), 'creative-123');
  assert.equal(params(result.querySelector('a')).get('fbclid'), 'quiz-click');
  dom.window.close();
});

test('attribution works with blocked storage and malformed saved data never leaks', () => {
  const html = '<a href="https://hellonancy.com/products/ace?utm_source=thelatest">Shop</a>';
  const blocked = page(html, '?utm_source=meta&utm_id=123', undefined, true);
  assert.equal(params(blocked.window.document.querySelector('a')).get('utm_id'), '123');
  const corrupt = page(html, '', '{broken-json');
  assert.equal(params(corrupt.window.document.querySelector('a')).get('utm_source'), 'thelatest');
  const polluted = page(html, '', JSON.stringify({ utm_source: 'meta', email: 'private@example.com', ad_id: 123, v: 'quiet' }));
  assert.deepEqual([...params(polluted.window.document.querySelector('a'))], [['utm_source', 'meta']]);
  for (const dom of [blocked, corrupt, polluted]) dom.window.close();
});

test('case-insensitive tracking keys use the first value and oversized inputs are ignored', () => {
  const dom = page('<a href="https://hellonancy.com/products/ace">Shop</a>',
    '?UTM_Source=meta&utm_source=duplicate&UTM_ID=123&GBRAID=google'
    + '&utm_' + 'k'.repeat(70) + '=bad&utm_content=' + 'x'.repeat(2049));
  assert.deepEqual([...params(dom.window.document.querySelector('a'))], [
    ['utm_source', 'meta'], ['utm_id', '123'], ['gbraid', 'google']
  ]);
  dom.window.close();
});
