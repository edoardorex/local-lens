import http from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { createLensServer } from '../skills/local-lens/scripts/server.mjs';
import { createDemo } from '../demo/server.mjs';
import { writeSoundtrack } from './soundtrack.mjs';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), 'local-lens-recording-'));
const source = path.join(scratch, 'index.html');
const original = await readFile(new URL('../demo/index.html', import.meta.url), 'utf8');
await writeFile(source, original);
await mkdir(docs, { recursive: true });
let app;
let lens;
let stage;
let browser;
try {
  app = await createDemo(0, source);
  lens = await createLensServer({ target: `http://127.0.0.1:${app.address().port}` });
  const presentation = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Local Lens demo</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#0b0f13;color:#eef3ed;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
    .glow{position:absolute;width:900px;height:900px;border-radius:50%;background:#aaff6010;filter:blur(100px);right:-250px;top:-350px}
    header{position:absolute;top:50px;left:54px;right:54px;display:flex;align-items:center;justify-content:space-between}
    .brand{display:flex;align-items:center;gap:14px;font-size:25px;font-weight:700;letter-spacing:-.7px}.logo{background:#b8fd78;color:#16210d;border-radius:13px;width:44px;height:44px;display:grid;place-items:center;font-size:34px}
    .pill{font-size:12px;letter-spacing:1.8px;color:#b8fd78;border:1px solid #b8fd7830;padding:11px 16px;border-radius:30px}
    h1{position:absolute;left:54px;top:102px;font-size:45px;font-weight:500;letter-spacing:-1.6px;margin:0}
    #caption{position:absolute;right:54px;top:123px;color:#91a08e;font-size:16px}
    .window{position:absolute;left:54px;top:199px;width:1258px;height:788px;border:1px solid #ffffff20;border-radius:17px;overflow:hidden;background:#15191f;box-shadow:0 20px 70px #0005}
    .chrome{height:42px;display:flex;align-items:center;gap:7px;padding:0 17px;border-bottom:1px solid #ffffff0f;color:#90a08c;font-size:11px}
    .circle{width:8px;height:8px;border-radius:50%;background:#ffffff26}.address{margin-left:24px;letter-spacing:.5px}
    iframe{width:1256px;height:744px;border:0;background:#f6f7f2}
    .terminal{position:absolute;left:1340px;top:199px;width:526px;height:788px;border:1px solid #ffffff20;border-radius:17px;background:#11171c;overflow:hidden;box-shadow:0 20px 70px #0004}
    .term-title{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#161d23;border-bottom:1px solid #ffffff0f;font-size:11px;color:#8f9caa}
    .live{color:#b8fd78}.code{padding:27px;font:15px/1.9 Consolas,ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
    .muted{color:#71818d}.green{color:#b8fd78}.white{color:#f3f5ef}.added{background:#b8fd7810;color:#b8fd78;display:block;padding:3px 9px;margin-left:-9px;border-left:2px solid #b8fd78}.deleted{color:#df9b96}
    .label{font-size:10px;letter-spacing:1.6px;color:#829281;margin:22px 0 9px}
    footer{position:absolute;left:54px;right:54px;bottom:32px;display:flex;justify-content:space-between;font-size:12px;color:#7e8d80}
    #cursor{position:absolute;z-index:20;pointer-events:none;left:-50px;top:-50px;filter:drop-shadow(0 3px 4px #0007);transition:left .35s ease,top .35s ease}
    #ripple{position:absolute;border:3px solid #b8fd78;border-radius:50%;width:40px;height:40px;z-index:19;pointer-events:none;opacity:0}
    .pulse{animation:pulse .5s ease-out}@keyframes pulse{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}
    #cover{position:absolute;inset:0;background:radial-gradient(ellipse at 75% 20%,#b8fd7816,transparent 65%),#0b0f13;z-index:30;display:flex;align-items:center;justify-content:center;text-align:center;transition:opacity .6s ease}
    #cover.hidden{opacity:0;pointer-events:none}.cover-mark{margin:0 auto 30px;width:80px;height:80px;border-radius:23px;background:#b8fd78;color:#16210d;font-size:60px;display:grid;place-items:center}
    .cover-title{font-size:98px;letter-spacing:-5px;font-weight:600;line-height:1.05}.accent{color:#b8fd78;font-family:Georgia,serif;font-style:italic;font-weight:400}.cover-sub{font-size:22px;color:#93a38e;margin-top:30px;letter-spacing:.2px}
    .cover-foot{margin-top:42px;font-size:13px;color:#71816e;letter-spacing:1.5px;text-transform:uppercase}
  </style>
  <div class="glow"></div>
  <header><div class="brand"><span class="logo">&#9678;</span>Local Lens</div><div class="pill">A CUSTOM COPILOT SKILL</div></header>
  <h1 id="headline">Your UI. Your words. Real source edits.</h1><div id="caption">01 / Open your local app</div>
  <div class="window"><div class="chrome"><span class="circle"></span><span class="circle"></span><span class="circle"></span><span class="address">localhost / playground</span></div><iframe title="Local frontend" src="${lens.origin}"></iframe></div>
  <div class="terminal"><div class="term-title"><span>copilot / local-lens</span><span class="live">LOCAL SESSION</span></div><div class="code" id="code"></div></div>
  <footer><span>Scripted walkthrough. Real picker + real source edit. No live model call.</span><span>LOCAL-FIRST / ZERO RUNTIME DEPENDENCIES</span></footer>
  <svg id="cursor" width="30" height="38" viewBox="0 0 30 38"><path d="M3 2L4 29L11 22L17 35L23 32L17 20L27 19Z" fill="#fff" stroke="#1b291c" stroke-width="2"/></svg><div id="ripple"></div>
  <div id="cover"><div><div class="cover-mark">&#9678;</div><div class="cover-title">Stop describing <span class="accent">where.</span><br>Start shaping <span class="accent">what.</span></div><div class="cover-sub">Point. Prompt. Make it real.</div><div class="cover-foot">Local Lens / A custom Copilot skill</div></div></div>
  </html>`;
  stage = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(presentation);
  });
  await new Promise((resolve) => stage.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${stage.address().port}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: /Pick element/ }).waitFor();
  const started = Date.now();
  const pause = (ms) => page.waitForTimeout(ms);
  async function chapter(title, caption, code) {
    await page.evaluate(({ title, caption, code }) => {
      document.querySelector('#headline').textContent = title;
      document.querySelector('#caption').textContent = caption;
      document.querySelector('#code').innerHTML = code;
    }, { title, caption, code });
  }
  async function click(locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Demo target is not visible.');
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.evaluate(({ x, y }) => {
      Object.assign(document.querySelector('#cursor').style, { left: `${x}px`, top: `${y}px` });
    }, point);
    await page.mouse.move(point.x, point.y, { steps: 20 });
    await pause(450);
    await page.evaluate(({ x, y }) => {
      const ripple = document.querySelector('#ripple');
      Object.assign(ripple.style, { left: `${x - 20}px`, top: `${y - 20}px` });
      ripple.classList.remove('pulse');
      void ripple.offsetWidth;
      ripple.classList.add('pulse');
    }, point);
    await locator.click();
  }
  await chapter('Your UI. Your words. Real source edits.', '01 / Open your local app',
    '<span class="green">$</span> /local-lens\n\n<span class="muted">Starting the visual editing bridge...</span>\n\n<span class="green">Ready.</span> Your local app is connected.\n\n<span class="muted">No extension.\nNo API key.\nNo runtime dependencies.</span>\n\n<div class="label">THE LOOP</div>1. Pick an element\n2. Describe your change\n3. Copilot edits the source');
  await pause(2600);
  await page.locator('#cover').evaluate((element) => element.classList.add('hidden'));
  await pause(1800);
  await chapter('Don\'t explain where. Just point.', '02 / Select the actual element',
    '<span class="green">$</span> local-lens next\n\n<span class="muted">Waiting for a browser selection...</span>\n\n<div class="label">PRECISE CONTEXT</div>Element + selector\nVisible text\nComputed styles\nSize + ancestors\n\n<span class="muted">All stays on your machine.</span>');
  await click(frame.getByRole('button', { name: /Pick element/ }));
  await pause(500);
  await click(frame.getByTestId('hero-cta'));
  await pause(1200);
  await chapter('Your words become the brief.', '03 / Describe what should change',
    '<span class="green">Selected</span> button\n\n<span class="muted">data-testid</span> hero-cta\n<span class="muted">text</span> Find your flow\n<span class="muted">border-radius</span> 8px\n<span class="muted">padding</span> 15px 21px\n\n<div class="label">YOU BRING THE INTENT</div>No hunting through component trees.\nNo guessing which button.\nNo screenshot annotation.');
  await frame.getByRole('textbox').pressSequentially(
    'Make this button pop: lime background, pill corners, and more breathing room.', { delay: 31 },
  );
  await pause(1100);
  await click(frame.getByRole('button', { name: 'Send to Copilot' }));
  await frame.getByRole('status').filter({ hasText: 'Queued locally' }).waitFor();
  const request = await (await fetch(`${lens.origin}${lens.prefix}/next?timeout=3`)).json();
  if (!request.id || request.element.attributes['data-testid'] !== 'hero-cta') {
    throw new Error('Recording did not deliver the real button selection.');
  }
  await chapter('Not a DOM trick. A real source change.', '04 / Edit the real component',
    '<span class="green">Received selection.</span>\n\n<span class="muted">demo / index.html</span>\n\n<span class="deleted">- border-radius: 8px;</span>\n<span class="added">+ border-radius: 999px;</span>\n<span class="deleted">- padding: 15px 21px;</span>\n<span class="added">+ padding: 19px 29px;</span>\n<span class="deleted">- background: #294e38;</span>\n<span class="added">+ background: #b8fd78;</span>\n<span class="added">+ color: #17220d;</span>\n\n<span class="muted">Source saved. Refreshing preview...</span>');
  await pause(3300);
  const updated = original
    .replace('border-radius:8px;color:#fff;background:#294e38;padding:15px 21px',
      'border-radius:999px;color:#17220d;background:#b8fd78;padding:19px 29px');
  if (updated === original) throw new Error('Demo source replacement failed.');
  await writeFile(source, updated);
  await fetch(`${lens.origin}${lens.prefix}/result`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: request.id, status: 'done', summary: 'Updated the button color, corners, and spacing.' }),
  });
  await frame.getByRole('status').filter({ hasText: 'Updated: Updated the button' }).waitFor();
  await pause(700);
  await page.locator('iframe').evaluate((iframe) => { iframe.src = iframe.src; });
  await frame.getByTestId('hero-cta').waitFor();
  const background = await frame.getByTestId('hero-cta').evaluate((element) => getComputedStyle(element).backgroundColor);
  if (background !== 'rgb(184, 253, 120)') throw new Error('Source edit did not reach the browser.');
  await chapter('Same app. Better feeling. Yours.', '05 / See the source change',
    '<span class="green">Source updated.</span>\n<span class="green">Preview refreshed.</span>\n<span class="green">Selection completed.</span>\n\n<div class="label">A TIGHTER FEEDBACK LOOP</div>See it.\nSelect it.\nShape it.\n\n<span class="muted">Any framework.\nYour local dev server.\nYour actual source code.</span>\n\n<span class="green">What will you change next?</span>');
  await click(frame.getByRole('button', { name: /Pick element/ }));
  await click(frame.getByTestId('hero-cta'));
  await frame.getByRole('textbox').fill('That is the feeling. Keep going.');
  await page.screenshot({ path: path.join(docs, 'video-poster.png') });
  await pause(3200);
  await page.evaluate(() => {
    document.querySelector('#cover').innerHTML = '<div><div class="cover-mark">&#9678;</div><div class="cover-title">Less explaining.<br><span class="accent">More making.</span></div><div class="cover-sub">Local Lens</div><div class="cover-foot">A custom Copilot skill. Built for your local frontend.</div></div>';
    document.querySelector('#cover').classList.remove('hidden');
  });
  await pause(3200);
  const seconds = (Date.now() - started) / 1000 + 1;
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  await context.close();
  const raw = await video.path();
  const music = path.join(scratch, 'original-score.wav');
  await writeSoundtrack(music, seconds + 2);
  const destination = path.join(docs, 'local-lens-demo.mp4');
  await new Promise((resolve, reject) => {
    const render = spawn(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-i', music,
      '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '-1',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-vf', 'fps=30', '-af', `afade=t=out:st=${Math.max(0, seconds - 2)}:d=1.5`,
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
      '-metadata', 'title=Local Lens - Less explaining. More making.',
      '-metadata', 'comment=Scripted demo. Original procedural soundtrack. No live model call.',
      destination,
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    render.stderr.on('data', (data) => { stderr += data; });
    render.on('error', reject);
    render.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Video render failed: ${stderr}`)));
  });
  console.log(`Created ${destination} (${seconds.toFixed(1)} second walkthrough, original stereo score).`);
} finally {
  await browser?.close();
  await lens?.close();
  if (app) { app.closeAllConnections(); await new Promise((resolve) => app.close(resolve)); }
  if (stage) { stage.closeAllConnections(); await new Promise((resolve) => stage.close(resolve)); }
  await rm(scratch, { recursive: true, force: true });
}
