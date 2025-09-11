let DB = null;
init();

async function init() {
  DB = await call('db:get');
  bind();
  render();
}

function bind() {
  document.getElementById('q').addEventListener('input', render);
  document.getElementById('back').addEventListener('click', () => {
    window.close();
  });
}

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const box = document.getElementById('list');
  box.innerHTML = '';
  const items = DB.requirements.slice();

  if (q) {
    for (const r of items) {
      const inTitle = r.title.toLowerCase().includes(q) ? 1 : 0;
      const inLinks = (DB.linksByReq[r.id] || []).some(l =>
        (l.title || '').toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
      ) ? 1 : 0;
      r.__score = inTitle + inLinks;
    }
    items.sort((a, b) => (b.__score || 0) - (a.__score || 0));
  } else {
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  for (const r of items) {
    const card = document.createElement('div');
    card.className = 'card';

    const h3 = document.createElement('h3');
    const title = document.createElement('span');
    title.textContent = r.title + (r.archived ? ' (已归档)' : '');

    const ops = document.createElement('span');
    const btnOpenAll = btn('全部打开', () => openAll(r.id));
    const btnRename = btn('重命名', async () => {
      const nv = prompt('新的名称：', r.title);
      if (nv && nv.trim()) {
        await call('req:rename', { id: r.id, title: nv.trim() });
        DB = await call('db:get');
        render();
      }
    });
    const btnArchive = btn(r.archived ? '恢复' : '归档', async () => {
      await call(r.archived ? 'req:unarchive' : 'req:archive', { id: r.id });
      DB = await call('db:get');
      render();
    });
    const btnDelete = btn('删除', async () => {
      if (confirm('删除后不可恢复，确认？')) {
        await call('req:delete', { id: r.id });
        DB = await call('db:get');
        render();
      }
    });
    ops.append(btnOpenAll, space(), btnRename, space(), btnArchive, space(), btnDelete);

    h3.append(title, ops);

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = new Date(r.createdAt).toLocaleString();

    const linksBox = document.createElement('div');
    linksBox.className = 'links';
    const links = DB.linksByReq[r.id] || [];
    if (links.length === 0) {
      linksBox.innerHTML = '<div class="muted">暂无链接</div>';
    } else {
      for (const l of links) {
        const row = document.createElement('div');
        row.className = 'link';
        const ico = document.createElement('img'); ico.width = 16; ico.height = 16; ico.src = l.favicon || 'icons/icon16.png';
        const a = document.createElement('a'); a.href = l.url; a.textContent = l.title || l.url; a.target = '_blank';
        const rm = btn('移除', async () => {
          await call('link:remove', { id: r.id, linkId: l.id });
          DB = await call('db:get');
          render();
        });
        row.append(ico, a, rm);
        linksBox.appendChild(row);
      }
    }

    card.append(h3, meta, linksBox);
    box.appendChild(card);
  }
}

function btn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text; b.addEventListener('click', onClick);
  return b;
}

function space() { return document.createTextNode(' '); }

async function openAll(id) {
  const list = DB.linksByReq[id] || [];
  for (const l of list) chrome.tabs.create({ url: l.url, active: false });
}

function call(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (!res || !res.ok) return reject(res?.error || 'Unknown error');
      resolve(res.data);
    });
  });
}