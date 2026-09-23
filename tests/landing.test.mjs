import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('../', import.meta.url));
const $ = load(readFileSync(resolve(root, 'index.html'), 'utf8'));
const main = $('main[data-landing]');

test('landing has one responsive content tree with accessible section headings', () => {
  assert.equal(main.length, 1);
  assert.equal(main.children('section').length, 8);
  assert.equal(main.find('.ssr-variant,[style],[class*="framer-"]').length, 0);
  main.children('section').each((_, element) => {
    const section = $(element);
    const label = section.attr('aria-labelledby');
    assert.ok(label || section.attr('aria-label'));
    if (label) assert.equal(section.find(`[id="${label}"]`).length, 1);
  });
});

test('existing landing deep links remain unique and navigation targets resolve', () => {
  const ids = main.find('[id]').map((_, e) => $(e).attr('id')).get();
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['product-overview','features','testimonial','Testimonial','pricing','PriceCard1','PriceCard2','PriceCard3','faq','free-trial']) {
    assert.ok(ids.includes(id), `Missing existing anchor: ${id}`);
  }
  $('nav a[href^="#"],main a[href^="#"]').each((_, e) => {
    const id = $(e).attr('href').slice(1);
    if (id) assert.ok($('[id]').toArray().some(target => $(target).attr('id') === id), `Missing target: ${id}`);
  });
});

test('landing media and catalog actions resolve without placeholder sources', () => {
  main.find('img').each((_, element) => {
    const image = $(element);
    assert.ok(existsSync(resolve(root, image.attr('src'))), image.attr('src'));
    assert.ok(Number(image.attr('width')) > 0);
    assert.ok(Number(image.attr('height')) > 0);
    assert.notEqual(image.attr('alt'), undefined);
  });
  main.find('a').each((_, element) => assert.equal($(element).attr('href'), '/app/'));
  assert.ok(existsSync(resolve(root, 'app/index.html')));
  assert.equal(main.find('[data-fusion-scroll-lamp]').length, 1);
});

test('FAQ and content cards are not duplicated by viewport', () => {
  assert.equal(main.find('.landing-pillar').length, 4);
  assert.equal(main.find('.landing-review').length, 5);
  assert.equal(main.find('.landing-plan').length, 3);
  const questions = main.find('details summary').map((_, e) => $(e).text().trim()).get();
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions).size, questions.length);
  main.find('details').each((_, e) => assert.ok($(e).find('.landing-answer').text().trim()));
});
