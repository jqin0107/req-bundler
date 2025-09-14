const $ = (s) => document.querySelector(s);
let DB = null;

init();

async function init() {
  applySavedTheme();          // 跟随 options 的主题开关
  bindThemeListener();
  DB = await call('db:get');
  renderActiveRequirements();
  bindGlobal();
  renderFooterHint();
}

/* 主题同步 */
function applySavedTheme(){
  const saved = localStorage.getItem('twos_theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}
function bindThemeListener(){
  window.addEventListener('storage', (e) => {
    if (e.key === 'twos_theme') applySavedTheme();
  });
}

function bindGlobal() {
  $('#btnAdd').addEventListener('click', async () => {
    const name = prompt('新建需求名称：');
    if (!name || !name.trim()) return;
    await call('req:create', { title: name.trim() });
    DB = await call('db:get');
    renderActiveRequirements(DB.lastSelectedRequirementId);
    renderFooterHint();
  });

  $('#btnMore').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL('options.html'), '_blank');
  });
}

function renderFooterHint() {
  const active = (DB.requirements || []).filter(r => !r.archived);
  const baseTips = '点击任一需求可展开查看链接；右侧 ✓ 可归档该需求。';
  const emptyTips = '暂无进行中的需求。点击右上角「+」新建。';
  $('#footerHint').textContent = active.length ? baseTips : `${baseTips} ${emptyTips}`;
}

function renderActiveRequirements(focusId = null) {
  const listBox = $('#reqList');
  listBox.innerHTML = '';

  const active = (DB.requirements || []).filter(r => !r.archived);
  if (active.length === 0) return;

  for (const r of active) {
    const card = document.createElement('div');
    card.className = 'req';
    card.dataset.id = r.id;

    const header = document.createElement('div');
    header.className = 'req-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'req-title';

    const pr = document.createElement('span');
    pr.className = 'priority-tag ' + (r.priority || 'p1');
    pr.textContent = (r.priority || 'p1').toUpperCase();
    pr.title = '点击切换优先级（P0 → P1 → P2）';
    pr.addEventListener('click', async (e) => {
      e.stopPropagation();
      const next = nextPriority(r.priority || 'p1');
      await call('req:setPriority', { id: r.id, priority: next });
      r.priority = next; // 关键：更新本地状态，支持连续点击
      pr.classList.remove('p0','p1','p2');
      pr.classList.add(next);
      pr.textContent = next.toUpperCase();
    });

    const tspan = document.createElement('span');
    tspan.className = 'req-title-text';
    tspan.textContent = r.title;

    titleWrap.append(pr, tspan);

    const btns = document.createElement('div');
    btns.className = 'req-btns';
    const btnDone = mkIconBtn(checkIcon(), async (ev) => {
      ev.stopPropagation();
      await call('req:archive', { id: r.id });
      DB = await call('db:get');
      renderActiveRequirements();
      renderFooterHint();
    });
    btnDone.classList.add('btn-check');
    btnDone.title = '标记完成（归档）';
    btns.appendChild(btnDone);

    header.append(titleWrap, btns);

    const body = document.createElement('div');
    body.className = 'req-body';
    const inner = document.createElement('div');
    inner.style.padding = '10px 0 12px';
    body.appendChild(inner);
    inner.appendChild(renderReqBody(r.id));

    header.addEventListener('click', async () => {
      await call('req:select', { id: r.id });
      toggleCard(card); // 允许多卡同时展开
    });

    card.append(header, body);
    listBox.appendChild(card);

    if (focusId && focusId === r.id) openCard(card, false);
  }
}

/* 下拉动画：允许多开 */
function toggleCard(card) {
  if (card.classList.contains('open')) closeCard(card);
  else openCard(card, true);
}
function openCard(card, animate = true) {
  const body = card.querySelector('.req-body');
  if (!body) return;
  body.style.maxHeight = '0px';
  requestAnimationFrame(() => {
    const contentHeight = body.scrollHeight;
    if (!animate) body.style.transition = 'none';
    body.style.maxHeight = contentHeight + 'px';
    if (!animate) { void body.offsetHeight; body.style.transition = ''; }
    card.classList.add('open');
  });
}
function closeCard(card) {
  const body = card.querySelector('.req-body');
  if (!body) return;
  const current = body.scrollHeight;
  body.style.maxHeight = current + 'px';
  requestAnimationFrame(() => {
    body.style.maxHeight = '0px';
    card.classList.remove('open');
  });
}
function refreshOpenHeight(card) {
  const body = card.querySelector('.req-body');
  if (!body || !card.classList.contains('open')) return;
  body.style.maxHeight = '0px';
  requestAnimationFrame(() => {
    body.style.maxHeight = body.scrollHeight + 'px';
  });
}

function renderReqBody(reqId) {
  const wrap = document.createElement('div');

  const ops = document.createElement('div');
  ops.style.display = 'flex';
  ops.style.gap = '8px';
  ops.style.marginBottom = '8px';

  const btnAddCur = mkBtn('将当前页面加入', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await call('link:add', {
      id: reqId,
      link: { title: tab.title, url: tab.url, favicon: tab.favIconUrl }
    });
    DB = await call('db:get');

    const card = document.querySelector(`.req[data-id="${reqId}"]`);
    if (card) {
      const bodyInner = card.querySelector('.req-body > div');
      bodyInner.innerHTML = '';
      bodyInner.appendChild(renderReqBody(reqId));
      refreshOpenHeight(card);
    }
  });

  const btnOpenAll = mkBtn('全部打开', async () => {
    const list = DB.linksByReq[reqId] || [];
    for (const l of list) chrome.tabs.create({ url: l.url, active: false });
  });

  ops.append(btnAddCur, btnOpenAll);
  wrap.appendChild(ops);

  const listBox = document.createElement('div');
  listBox.className = 'links';
  wrap.appendChild(listBox);

  fillLinks(listBox, reqId);
  return wrap;
}

function fillLinks(container, reqId) {
  container.innerHTML = '';
  const links = (DB.linksByReq[reqId] || []);
  if (links.length === 0) {
    container.innerHTML = `<div class="muted">暂无链接</div>`;
    return;
  }
  for (const l of links) {
    const row = document.createElement('div');
    row.className = 'link-row';

    const ico = document.createElement('img');
    ico.src = l.favicon || 'icons/icon16.png';

    const a = document.createElement('a');
    a.href = l.url; a.target = '_blank'; a.textContent = l.title || l.url;

    // 复制按钮（在 x 左边，风格一致，无边框小图标）
    const cp = document.createElement('button');
    cp.className = 'link-mini link-copy';
    cp.innerHTML = copyIconSmall();
    cp.title = '复制链接';
    cp.addEventListener('click', async () => {
      try {
        await copyToClipboard(l.url);
        // 轻量反馈：闪一下颜色
        cp.style.color = 'var(--accent-hover)';
        setTimeout(() => { cp.style.color = ''; }, 350);
      } catch (e) {
        alert('复制失败，请手动复制：\n' + l.url);
      }
    });

    // 小号 x，无边框
    const rm = document.createElement('button');
    rm.className = 'link-mini link-remove';
    rm.textContent = 'x';
    rm.title = '移除该链接';
    rm.addEventListener('click', async () => {
      await call('link:remove', { id: reqId, linkId: l.id });
      DB = await call('db:get');
      const card = document.querySelector(`.req[data-id="${reqId}"]`);
      if (card) {
        const bodyInner = card.querySelector('.req-body > div');
        bodyInner.innerHTML = '';
        bodyInner.appendChild(renderReqBody(reqId));
        refreshOpenHeight(card);
      }
    });

    // 顺序：图标、标题、复制、删除
    row.append(ico, a, cp, rm);
    container.appendChild(row);
  }
}

/* SVG 图标 */
function checkIcon(){
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path class="icon-stroke" d="M20 6L9 17l-5-5"/>
    </svg>
  `;
}
function copyIconSmall(){
  /* 两层叠放的小方框（复制） */
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" class="icon-stroke"></rect>
      <rect x="5" y="5" width="10" height="10" rx="2" class="icon-stroke" opacity="0.8"></rect>
    </svg>
  `;
}
function mkIconBtn(svgHTML, onClick){
  const b = document.createElement('button');
  b.className = 'btn-check';
  b.innerHTML = svgHTML;
  b.addEventListener('click', onClick);
  return b;
}

/* 复制到剪贴板（有降级方案） */
async function copyToClipboard(text){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/* Utils */
function nextPriority(p) {
  if (p === 'p0') return 'p1';
  if (p === 'p1') return 'p2';
  return 'p0';
}
function mkBtn(text, onClick) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function call(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (!res || !res.ok) return reject(res?.error || 'Unknown error');
      resolve(res.data);
    });
  });
}