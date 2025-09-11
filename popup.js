const $ = (s) => document.querySelector(s);
let DB = null;
let currentReqId = null;

init();

async function init() {
  DB = await call('db:get');
  renderReqSelect();
  bind();
  renderLinks();
}

function bind() {
  $('#createReqBtn').addEventListener('click', async () => {
    const name = $('#newReqInput').value.trim();
    if (!name) return;
    const req = await call('req:create', { title: name });
    DB = await call('db:get');
    currentReqId = req.id;
    $('#newReqInput').value = '';
    renderReqSelect();
    renderLinks();
  });

  $('#reqSelect').addEventListener('change', async (e) => {
    currentReqId = e.target.value;
    await call('req:select', { id: currentReqId });
    renderLinks();
  });

  $('#addCurrentBtn').addEventListener('click', async () => {
    if (!currentReqId) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await call('link:add', {
      id: currentReqId,
      link: { title: tab.title, url: tab.url, favicon: tab.favIconUrl }
    });
    DB = await call('db:get');
    renderLinks();
  });

  $('#openAllBtn').addEventListener('click', () => {
    const list = (DB.linksByReq[currentReqId] || []);
    for (const l of list) {
      chrome.tabs.create({ url: l.url, active: false });
    }
  });

  $('#archiveBtn').addEventListener('click', async () => {
    const req = DB.requirements.find(r => r.id === currentReqId);
    if (!req) return;
    if (req.archived) await call('req:unarchive', { id: req.id });
    else await call('req:archive', { id: req.id });
    DB = await call('db:get');
    renderReqSelect();
    renderLinks();
  });

  $('#manageBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  $('#searchInput').addEventListener('input', () => renderLinks());
}

function renderReqSelect() {
  const sel = $('#reqSelect');
  sel.innerHTML = '';
  const groups = [
    { name: '活动的需求', items: DB.requirements.filter(r => !r.archived) },
    { name: '已归档', items: DB.requirements.filter(r => r.archived) },
  ];
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = g.name;
    for (const r of g.items) {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.title;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }

  currentReqId = DB.lastSelectedRequirementId || (groups[0].items[0]?.id || groups[1].items[0]?.id || null);
  if (currentReqId) sel.value = currentReqId;
  $('#archiveBtn').textContent = DB.requirements.find(r => r.id === currentReqId)?.archived ? '恢复' : '归档';

  $('#hint').textContent = currentReqId ? '' : '还没有需求，先新建一个吧～';
}

function renderLinks() {
  const box = $('#links');
  box.innerHTML = '';
  if (!currentReqId) return;
  const keyword = $('#searchInput').value.trim().toLowerCase();

  const list = (DB.linksByReq[currentReqId] || [])
    .filter(l => !keyword || (l.title?.toLowerCase().includes(keyword) || l.url.toLowerCase().includes(keyword)));

  if (list.length === 0) {
    box.innerHTML = '<div class="muted">暂无链接</div>';
    return;
  }

  for (const l of list) {
    const row = document.createElement('div');
    row.className = 'link';
    const ico = document.createElement('img');
    ico.src = l.favicon || 'icons/icon16.png';
    const a = document.createElement('a');
    a.href = l.url; a.textContent = l.title || l.url; a.target = '_blank';
    const del = document.createElement('button');
    del.textContent = '移除';
    del.addEventListener('click', async () => {
      await call('link:remove', { id: currentReqId, linkId: l.id });
      DB = await call('db:get');
      renderLinks();
    });
    row.appendChild(ico); row.appendChild(a); row.appendChild(del);
    box.appendChild(row);
  }
}

function call(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (!res || !res.ok) return reject(res?.error || 'Unknown error');
      resolve(res.data);
    });
  });
}