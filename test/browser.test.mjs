import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createLensServer } from '../skills/local-lens/scripts/server.mjs';
import { createDemo } from '../demo/server.mjs';

test('real browser: pick, queue, source edit, refresh, result, mobile, and privacy', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lens-browser-test-'));
  const source = path.join(directory, 'index.html');
  const original = await readFile(new URL('../demo/index.html', import.meta.url), 'utf8');
  await writeFile(source, original);
  const upstream = await createDemo(0, source);
  const lens = await createLensServer({ target: `http://127.0.0.1:${upstream.address().port}` });
  let browser;
  t.after(async () => {
    await browser?.close();
    await lens.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${lens.origin}/?token=not-to-be-collected#private`);
  const pick = page.getByRole('button', { name: /Pick element/ });
  await pick.click();
  await page.getByTestId('hero-cta').click();
  assert.equal(await page.getByTestId('hero-cta').innerText(), 'Find your flow →');
  await page.getByRole('textbox', { name: 'What should change?' }).fill('Make this button pill-shaped and increase its padding.');
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  if (process.env.UPDATE_SCREENSHOTS === '1') {
    await page.screenshot({ path: fileURLToPath(new URL('../docs/preview.png', import.meta.url)), fullPage: true });
  }
  await page.getByRole('button', { name: 'Send to Copilot' }).click();
  await page.getByRole('status').filter({ hasText: 'Queued locally' }).waitFor();
  const response = await fetch(`${lens.origin}${lens.prefix}/next?timeout=1`);
  const request = await response.json();
  assert.equal(request.instruction, 'Make this button pill-shaped and increase its padding.');
  assert.equal(request.element.attributes['data-testid'], 'hero-cta');
  assert.equal(request.page.path, '/');
  assert.ok(!JSON.stringify(request).includes('not-to-be-collected'));
  assert.match(request.element.selector, /hero-cta/);
  await writeFile(source, original.replace('border-radius:8px;color:#fff', 'border-radius:999px;color:#fff')
    .replace('padding:15px 21px', 'padding:19px 29px'));
  await fetch(`${lens.origin}${lens.prefix}/result`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: request.id, status: 'done', summary: 'Changed the button radius and padding.' }),
  });
  await page.getByRole('status').filter({ hasText: 'Updated: Changed the button radius and padding.' }).waitFor();
  await page.reload();
  assert.equal(await page.getByTestId('hero-cta').evaluate((element) => getComputedStyle(element).borderRadius), '999px');
  assert.equal(await page.getByTestId('hero-cta').evaluate((element) => getComputedStyle(element).padding), '19px 29px');
  await pick.click();
  await page.getByRole('heading', { name: 'A calmer space' }).click();
  await page.getByRole('textbox').fill('Give this heading more contrast.');
  await page.getByRole('button', { name: 'Send to Copilot' }).click();
  const second = await (await fetch(`${lens.origin}${lens.prefix}/next?timeout=3`)).json();
  await fetch(`${lens.origin}${lens.prefix}/result`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: second.id, status: 'failed', summary: 'No source changes made.' }),
  });
  await page.getByRole('status').filter({ hasText: 'Could not complete: No source changes made.' }).waitFor();
  await page.getByRole('button', { name: 'Close change panel' }).click();
  await pick.click();
  await page.keyboard.press('Escape');
  assert.equal(await pick.getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Hide Local Lens' }).click();
  await page.getByRole('button', { name: 'Show Local Lens' }).click();
  await page.evaluate(() => {
    const wrapper = document.createElement('section');
    wrapper.id = 'privacy-case';
    wrapper.innerHTML = '<span>Visible label</span><textarea>private default</textarea><input value="private value"><span hidden>hidden secret</span><script type="application/json">script secret</script>';
    document.body.prepend(wrapper);
  });
  await pick.click();
  await page.locator('#privacy-case').click({ position: { x: 2, y: 2 } });
  await page.getByRole('textbox', { name: 'What should change?' }).fill('Adjust the section spacing.');
  await page.getByRole('button', { name: 'Send to Copilot' }).click();
  const privacy = await (await fetch(`${lens.origin}${lens.prefix}/next?timeout=3`)).json();
  const encoded = JSON.stringify(privacy);
  assert.ok(!encoded.includes('private default'));
  assert.ok(!encoded.includes('private value'));
  assert.ok(!encoded.includes('hidden secret'));
  assert.ok(!encoded.includes('script secret'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const toolbar = await page.getByRole('region', { name: 'Local Lens toolbar' }).boundingBox();
  assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= 390);
  assert.deepEqual(errors, []);
});
