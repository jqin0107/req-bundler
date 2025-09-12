const $ = (s) => document.querySelector(s);
let DB = null;

init();

async function init() {
  DB = await call('db:get');
  renderActiveRequirements();
  bindGlobal();
}

function bindGlobal() {
  // 右上角 "+" 添加新需求
  $('#btnAdd').addEventListener('click', async (e) => {
    e.stopPropagation();
    const name = prompt('新建需求名称：');
    if (!name || !name.trim()) return;
    const req = await call('req:create', { title: name.trim() });
    DB = await call('db:get');
    renderActiveRequirements(req.id); // 聚焦到新建的需求
  });

  // 右下角 "：" 打开归档面板（FAB）
  $('#btnMore').addEventListener('click', (e) => {
    e.stopPropagation();
    renderArchivedPanel();
    $('#overlay').classList.add('show');
  });

  // 点击遮罩关闭
  $('#overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') $('#overlay').classList.remove('show');
  });
}

function renderActiveRequirements(focusId = null) {
  const listBox = $('#reqList');
  listBox.innerHTML = '';

  const active = (DB.requirements || []).filter(r => !r.archived);
  if (active.length === 0) {
    listBox.innerHTML = `<div class="muted">暂无进行中的需求。点击右上角「+」新建。</div>`;
    return;
  }

  for (const r of active) {
    const card = document.createElement('div');
    card.className = 'req';
    card.dataset.id = r.id;

    // header
    const header = document.createElement('div');
    header.className = 'req-header ripple';

    const title = document.createElement('div');
    title.className = 'req-title';
    title.textContent = r.title;

    const btns = document.createElement('div');
    btns.className = 'req-btns';
    const btnDone = mkBtn('Done', async (ev) => {
      ev.stopPropagation();
      await call('req:archive', { id: r.id });
      DB = await call('db:get');
      renderActiveRequirements();
    });
    btns.appendChild(btnDone);

    header.append(title, btns);

    // body
    const body = document.createElement('div');
    body.className = 'req-body';
    body.appendChild(renderReqBody(r.id));

    // 点击 header 展开/收起
    header.addEventListener('click', async () => {
      // 记录最近选择，方便右键菜单收录
      await call('req:select', { id: r.id });
      const alreadyOpen = card.classList.contains('open');
      document.querySelectorAll('.req.open').forEach(el => el.classList.remove('open'));
      if (!alreadyOpen) card.classList.add('open');
    });

    card.append(header, body);
    listBox.appendChild(card);

    if (focusId && focusId === r.id) card.classList.add('open');
  }
}

function renderReqBody(reqId) {
  const wrap = document.createElement('div');

  // 操作按钮行
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
    refreshReqBody(reqId, wrap);
  });

  const btnOpenAll = mkBtn('全部打开', async () => {
    const list = DB.linksByReq[reqId] || [];
    for (const l of list) chrome.tabs.create({ url: l.url, active: false });
  });

  // 主操作使用主色调
  btnAddCur.classList.add('btn-primary');

  ops.append(btnAddCur, btnOpenAll);
  wrap.appendChild(ops);

  // 链接列表
  const listBox = document.createElement('div');
  listBox.className = 'links';
  wrap.appendChild(listBox);

  fillLinks(listBox, reqId);
  return wrap;
}

function refreshReqBody(reqId, wrapEl) {
  const linksBox = wrapEl.querySelector('.links');
  if (!linksBox) return;
  fillLinks(linksBox, reqId);
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
    row.className = 'link-row ripple';

    const ico = document.createElement('img');
    ico.src = l.favicon || 'icons/icon16.png';

    const a = document.createElement('a');
    a.href = l.url; a.target = '_blank'; a.textContent = l.title || l.url;

    const rm = mkBtn('移除', async () => {
      await call('link:remove', { id: reqId, linkId: l.id });
      DB = await call('db:get');
      fillLinks(container, reqId);
    });
    rm.classList.add('btn-danger');

    row.append(ico, a, rm);
    container.appendChild(row);
  }
}

/* 归档面板 */
function renderArchivedPanel() {
  const box = $('#archivedList');
  box.innerHTML = '';

  const archived = (DB.requirements || []).filter(r => r.archived);
  if (archived.length === 0) {
    box.innerHTML = `<div class="muted">暂无归档需求</div>`;
    return;
  }

  for (const r of archived) {
    const it = document.createElement('div');
    it.className = 'arch-item';

    const name = document.createElement('div');
    name.textContent = r.title;

    const ops = document.createElement('div');
    ops.className = 'arch-ops';

    const btnOpenAll = mkBtn('全部打开', () => {
      const list = DB.linksByReq[r.id] || [];
      for (const l of list) chrome.tabs.create({ url: l.url, active: false });
    });

    const btnRename = mkBtn('重命名', async () => {
      const nv = prompt('新的名称：', r.title);
      if (nv && nv.trim()) {
        await call('req:rename', { id: r.id, title: nv.trim() });
        DB = await call('db:get');
        renderArchivedPanel();
      }
    });

    const btnRestore = mkBtn('恢复', async () => {
      await call('req:unarchive', { id: r.id });
      DB = await call('db:get');
      renderActiveRequirements(r.id);
      renderArchivedPanel();
    });

    const btnDelete = mkBtn('删除', async () => {
      if (confirm('删除后不可恢复，确认？')) {
        await call('req:delete', { id: r.id });
        DB = await call('db:get');
        renderArchivedPanel();
      }
    });
    btnDelete.classList.add('btn-danger');

    ops.append(btnOpenAll, btnRename, btnRestore, btnDelete);
    it.append(name, ops);
    box.appendChild(it);
  }
}

/* 工具方法 */
function mkBtn(text, onClick) {
  const b = document.createElement('button');
  b.className = 'btn ripple';
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