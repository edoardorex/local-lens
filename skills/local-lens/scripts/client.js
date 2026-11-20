(() => {
  'use strict';
  if (document.getElementById('local-lens-root')) return;
  const prefix = '__LOCAL_LENS_PREFIX__';
  const host = document.createElement('div');
  host.id = 'local-lens-root';
  host.style.cssText = 'all:initial;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;color:#eef2f6;position:fixed;inset:0;pointer-events:none;z-index:2147483647;color-scheme:dark';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;color:#eef2f6}
      *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer}
      button:focus-visible,textarea:focus-visible{outline:2px solid #b8fd78;outline-offset:3px}
      [hidden]{display:none!important}
      .dock{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;align-items:center;
        gap:14px;padding:10px 12px 10px 18px;border:1px solid #ffffff20;background:#15191ff5;
        box-shadow:0 12px 45px #0005;border-radius:18px;pointer-events:auto}
      .brand{display:flex;align-items:center;gap:9px;font-weight:650;letter-spacing:-.3px;white-space:nowrap}
      .mark{display:grid;place-items:center;background:#b8fd78;color:#16210d;width:26px;height:26px;border-radius:8px;font-size:20px}
      .divider{height:22px;width:1px;background:#ffffff20}
      .pick{display:flex;gap:8px;align-items:center;border:0;border-radius:10px;background:#b8fd78;color:#17220d;padding:10px 14px;font-weight:700;white-space:nowrap}
      .pick[aria-pressed=true]{background:#e2ffc5}
      .hint{color:#a1aab8;font-size:11px;white-space:nowrap}
      .icon-button{border:0;background:transparent;color:#a1aab8;padding:8px;border-radius:8px}
      .panel{position:fixed;right:24px;top:24px;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - 125px);
        overflow:auto;background:#15191ffb;border:1px solid #ffffff20;border-radius:20px;box-shadow:0 24px 80px #0005;pointer-events:auto}
      .heading{padding:20px 20px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff12}
      .eyebrow{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#b8fd78;margin:0 0 7px}
      h2{font-size:19px;letter-spacing:-.6px;margin:0;font-weight:600}
      .content{padding:18px 20px 20px}.tag{color:#b8fd78;font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}
      .snippet{font-size:12px;line-height:1.6;color:#a1aab8;max-height:60px;overflow:hidden;margin:10px 0}
      .meta{font-size:10px;color:#8f9aa9;display:flex;gap:10px;margin-bottom:20px}
      label{display:block;font-size:12px;font-weight:600;margin-bottom:10px}
      textarea{display:block;resize:vertical;min-height:110px;width:100%;border:1px solid #ffffff24;background:#0e1117;color:#eef2f6;border-radius:11px;padding:12px;line-height:1.6}
      textarea::placeholder{color:#7e8998}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 18px}
      .chip{font-size:10px;color:#c0c8d3;border:1px solid #ffffff20;background:transparent;padding:6px 8px;border-radius:7px}
      .send{width:100%;padding:12px;border:0;border-radius:10px;font-weight:700;background:#b8fd78;color:#17220d}
      .send:disabled{opacity:.5;cursor:wait}.footnote{color:#8f9aa9;font-size:10px;line-height:1.6;margin:11px 0 0}
      .status{font-size:12px;line-height:1.6;padding:12px;border:1px solid #ffffff18;background:#ffffff06;border-radius:10px;margin-top:14px;overflow-wrap:anywhere}
      .status[data-state=done]{color:#b8fd78;border-color:#b8fd7838}.status[data-state=failed]{color:#ffb1b1;border-color:#ffb1b138}
      .outline{position:fixed;border:2px solid #a6ee68;background:#b8fd7815;border-radius:4px;pointer-events:none;transition:all 70ms ease}
      .badge{position:absolute;top:-25px;left:-2px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#b8fd78;color:#17220d;font:11px ui-monospace,monospace;padding:4px 7px;border-radius:4px}
      .restore{position:fixed;bottom:16px;right:16px;background:#15191f;color:#b8fd78;border:1px solid #ffffff25;border-radius:12px;padding:11px;pointer-events:auto}
      @media(max-width:520px){.dock{bottom:16px;gap:10px}.hint,.divider{display:none}.panel{top:16px;right:16px}.brand{font-size:12px}}
      @media(prefers-reduced-motion:reduce){.outline{transition:none}}
    </style>
    <div class="outline" hidden><span class="badge"></span></div>
    <section class="panel" aria-label="Local Lens change request" hidden>
      <header class="heading"><div><p class="eyebrow">From pixels to pull requests</p><h2>Make it yours.</h2></div>
        <button class="icon-button close-panel" aria-label="Close change panel">&#10005;</button></header>
      <div class="content">
        <div class="tag"></div><p class="snippet"></p><div class="meta"></div>
        <label for="lens-instruction">What should change?</label>
        <textarea id="lens-instruction" maxlength="4000" placeholder="Make this feel lighter. Softer corners, more breathing room, and a stronger call to action."></textarea>
        <div class="chips"><button class="chip">More breathing room</button><button class="chip">Improve contrast</button><button class="chip">Make it responsive</button></div>
        <button class="send">Send to Copilot <span aria-hidden="true">&rarr;</span></button>
        <p class="footnote">Sends this selection to your local CLI. Copilot edits the actual source; your app's live reload shows the result.</p>
        <div class="status" role="status" aria-live="polite" hidden></div>
      </div>
    </section>
    <div class="dock" role="region" aria-label="Local Lens toolbar">
      <div class="brand"><span class="mark" aria-hidden="true">&#9678;</span>Local Lens</div>
      <span class="divider"></span><span class="hint">See it. Select it. Shape it.</span>
      <button class="pick" aria-pressed="false"><span aria-hidden="true">&#8982;</span><span class="pick-label">Pick element</span></button>
      <button class="icon-button hide" aria-label="Hide Local Lens">&#10005;</button>
    </div>
    <button class="restore" aria-label="Show Local Lens" hidden>&#9678; Local Lens</button>`;
  document.documentElement.append(host);
  const $ = (selector) => root.querySelector(selector);
  let picking = false;
  let selected = null;
  let hovered = null;
  let requestId = null;
  let poll = null;

  function status(message, state = '') {
    $('.status').hidden = false;
    $('.status').textContent = message;
    $('.status').dataset.state = state;
  }

  function setPicking(value) {
    picking = value;
    $('.pick').setAttribute('aria-pressed', String(value));
    $('.pick-label').textContent = value ? 'Click an element' : 'Pick element';
    if (!value) {
      hovered = null;
      $('.outline').hidden = true;
    }
  }

  function selectorFor(element) {
    const parts = [];
    for (let node = element; node && parts.length < 6; node = node.parentElement) {
      let part = node.localName;
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const testId = node.getAttribute('data-testid');
      if (testId) {
        parts.unshift(`${part}[data-testid="${CSS.escape(testId)}"]`);
        break;
      }
      const classes = [...node.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
      part += classes;
      if (node.parentElement) {
        const siblings = [...node.parentElement.children].filter((sibling) => sibling.localName === node.localName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ').slice(0, 2000);
  }

  function visibleText(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('input,textarea,select,script,style,[hidden],[aria-hidden="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return parent.checkVisibility() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const parts = [];
    let length = 0;
    while (walker.nextNode() && length < 1000) {
      const value = walker.currentNode.textContent.replace(/\s+/g, ' ').trim();
      if (value) { parts.push(value); length += value.length + 1; }
    }
    return parts.join(' ').slice(0, 1000);
  }

  function context(element) {
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const styles = {};
    for (const name of ['display', 'position', 'color', 'background-color', 'font-family', 'font-size',
      'font-weight', 'line-height', 'padding', 'margin', 'gap', 'border-radius', 'border',
      'width', 'height', 'align-items', 'justify-content', 'grid-template-columns']) {
      styles[name] = computed.getPropertyValue(name).slice(0, 500);
    }
    const attributes = {};
    for (const name of ['id', 'class', 'role', 'aria-label', 'data-testid', 'type', 'name']) {
      if (element.hasAttribute(name)) attributes[name] = element.getAttribute(name).slice(0, 500);
    }
    const ancestors = [];
    for (let parent = element.parentElement; parent && ancestors.length < 6; parent = parent.parentElement) {
      ancestors.push(`${parent.localName}${parent.id ? `#${parent.id}` : ''}${[...parent.classList].slice(0, 3).map((name) => `.${name}`).join('')}`.slice(0, 500));
    }
    return {
      tag: element.localName, selector: selectorFor(element), text: visibleText(element),
      attributes, styles, ancestors,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }

  function draw(element) {
    if (!element?.isConnected) { $('.outline').hidden = true; return; }
    const rect = element.getBoundingClientRect();
    const outline = $('.outline');
    outline.hidden = false;
    Object.assign(outline.style, {
      left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
    $('.badge').textContent = selectorFor(element);
    $('.badge').style.top = rect.y < 30 ? '0' : '-25px';
  }

  document.addEventListener('pointermove', (event) => {
    if (!picking || event.composedPath().includes(host)) return;
    hovered = event.target instanceof Element ? event.target : null;
    draw(hovered);
  }, true);

  document.addEventListener('click', (event) => {
    if (!picking || event.composedPath().includes(host) || !(event.target instanceof Element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selected = context(event.target);
    setPicking(false);
    $('.panel').hidden = false;
    $('.tag').textContent = `<${selected.tag}>  ${selected.selector}`;
    $('.snippet').textContent = selected.text || 'No visible text. Selection uses element attributes and styling.';
    $('.meta').textContent = `${Math.round(selected.rect.width)} x ${Math.round(selected.rect.height)} px  /  ${selected.styles.display}`;
    $('.status').hidden = true;
    $('textarea').focus();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setPicking(false);
      $('.panel').hidden = true;
    }
  }, true);
  addEventListener('scroll', () => { if (picking && hovered) draw(hovered); }, true);
  addEventListener('resize', () => { if (picking && hovered) draw(hovered); });
  $('.pick').addEventListener('click', () => {
    if (requestId) {
      $('.panel').hidden = false;
      status('Finish the current request in Copilot before selecting another element.');
      return;
    }
    setPicking(!picking);
  });
  $('.close-panel').addEventListener('click', () => { $('.panel').hidden = true; $('.pick').focus(); });
  $('.hide').addEventListener('click', () => {
    setPicking(false);
    $('.panel').hidden = true;
    $('.dock').hidden = true;
    $('.restore').hidden = false;
  });
  $('.restore').addEventListener('click', () => {
    $('.dock').hidden = false;
    $('.restore').hidden = true;
  });
  for (const chip of root.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      const input = $('textarea');
      input.value = `${input.value.trim()}${input.value.trim() ? '. ' : ''}${chip.textContent}`.slice(0, 4000);
      input.focus();
    });
  }

  async function api(endpoint, data) {
    const response = await fetch(`${prefix}/${endpoint}`, {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'content-type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `Local bridge returned ${response.status}.`);
    return value;
  }

  async function pollResult() {
    try {
      const requests = await api('requests');
      const item = requests.find((request) => request.id === requestId);
      if (!item) throw new Error('This request is no longer in the session history.');
      if (item.status === 'done' || item.status === 'failed') {
        status(`${item.status === 'done' ? 'Updated' : 'Could not complete'}: ${item.summary}`, item.status);
        requestId = null;
        $('.send').disabled = false;
        return;
      }
      status(item.status === 'active' ? 'Copilot received your selection. Working on the source...' : 'Queued locally. Waiting for Copilot to receive your selection.');
      poll = setTimeout(pollResult, 1000);
    } catch (error) {
      status(`Bridge error: ${error.message} Your request may still be pending; check the CLI.`, 'failed');
      $('.send').disabled = false;
    }
  }

  $('.send').addEventListener('click', async () => {
    const instruction = $('textarea').value.trim();
    if (!selected || !instruction) {
      status('Select an element and describe the change first.');
      $('textarea').focus();
      return;
    }
    $('.send').disabled = true;
    clearTimeout(poll);
    try {
      const result = await api('requests', { instruction, element: selected, page: { path: location.pathname } });
      requestId = result.id;
      await pollResult();
    } catch (error) {
      status(`Could not send: ${error.message}`, 'failed');
      $('.send').disabled = false;
    }
  });
})();
