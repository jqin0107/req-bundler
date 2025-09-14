let DB = null;

init();

async function init() {
  applySavedTheme();           // 先应用主题
  bindThemeToggle();           // 绑定开关
  DB = await call('db:get');
  renderArchived();
}

/* ===== 主题开关 ===== */
function applySavedTheme(){
  const saved = localStorage.getItem('twos_theme'); // 'light' | 'dark'
  const theme = saved === 'dark' ? 'dark' : 'light'; // 默认 light
  document.documentElement.setAttribute('data-theme', theme);
  const sw = document.getElementById('themeSwitch');
  if (sw) sw.checked = theme === 'dark';
}
function bindThemeToggle(){
  const sw = document.getElementById('themeSwitch');
  if (!sw) return;
  sw.addEventListener('change', () => {
    const theme = sw.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('twos_theme', theme);
  });
}

/* ===== 归档渲染（保留你原有的无优先级展示） ===== */
function renderArchived() {
  const box = document.getElementById('archivedGrid');
  box.innerHTML = '';

  const archived = (DB.requirements || []).filter(r => r.archived);
  if (archived.length === 0) {
    box.innerHTML = '<p class="muted">暂无归档需求。</p>';
    return;
  }

  for (const r of archived) {
    const card = document.createElement('div');
    card.className = 'card';

    const h3 = document.createElement('h3');
    h3.textContent = r.title;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `创建时间：${new Date(r.createdAt).toLocaleString()}`;

    const row = document.createElement('div');
    row.className = 'row';

    row.append(
      btn('全部打开', () => {
        const list = DB.linksByReq[r.id] || [];
        for (const l of list) chrome.tabs.create({ url: l.url, active: false });
      }),
      btn('重命名', async () => {
        const nv = prompt('新的名称：', r.title);
        if (nv && nv.trim()) {
          await call('req:rename', { id: r.id, title: nv.trim() });
          DB = await call('db:get');
          renderArchived();
        }
      }),
      btn('恢复', async () => {
        await call('req:unarchive', { id: r.id });
        DB = await call('db:get');
        renderArchived();
      }),
      danger('删除', async () => {
        if (confirm('删除后不可恢复，确认？')) {
          await call('req:delete', { id: r.id });
          DB = await call('db:get');
          renderArchived();
        }
      })
    );

    const links = DB.linksByReq[r.id] || [];
    const list = document.createElement('div');
    list.className = 'links';
    if (links.length === 0) {
      list.innerHTML = '<div class="muted">暂无链接</div>';
    } else {
      for (const l of links) {
        const rowL = document.createElement('div');
        rowL.className = 'link';
        const ico = document.createElement('img'); ico.src = l.favicon || 'icons/icon16.png';
        const a = document.createElement('a'); a.href = l.url; a.textContent = l.title || l.url; a.target = '_blank';
        rowL.append(ico, a);
        list.appendChild(rowL);
      }
    }

    card.append(h3, meta, row, list);
    box.appendChild(card);
  }
}

/* Utils */
function btn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function danger(text, onClick) {
  const b = btn(text, onClick);
  b.classList.add('btn-danger');
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