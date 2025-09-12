// 数据结构：
// db = {
//   requirements: [{ id, title, archived, createdAt }],
//   linksByReq: { [id]: [{ id, title, url, favicon, addedAt }] },
//   lastSelectedRequirementId: string | null
// }

const DEFAULT_DB = {
  requirements: [],
  linksByReq: {},
  lastSelectedRequirementId: null,
};

chrome.runtime.onInstalled.addListener(async () => {
  const { db } = await chrome.storage.local.get('db');
  if (!db) await chrome.storage.local.set({ db: DEFAULT_DB });
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'quickAdd',
      title: '加入当前页面到上次的需求',
      contexts: ['page', 'frame', 'selection', 'link', 'image', 'video', 'audio']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'quickAdd') {
    const { db } = await chrome.storage.local.get('db');
    const rid = db?.lastSelectedRequirementId;
    if (!rid) return notify('请先在弹窗中选择/创建一个需求');
    if (!tab || !tab.url) return notify('无法获取当前标签页');

    await addLinkToRequirement(rid, {
      title: tab.title || '未命名页面',
      url: tab.url,
      favicon: tab.favIconUrl || '',
    });
    notify('已加入：' + (tab.title || tab.url));
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const wrap = (p) => p.then((res) => sendResponse({ ok: true, data: res }))
                      .catch((e) => sendResponse({ ok: false, error: String(e) }));
  if (msg?.type === 'db:get') { wrap(chrome.storage.local.get('db').then(({ db }) => db || DEFAULT_DB)); return true; }
  if (msg?.type === 'req:create') { wrap(createRequirement(msg.title)); return true; }
  if (msg?.type === 'req:select') { wrap(setLastSelected(msg.id)); return true; }
  if (msg?.type === 'req:rename') { wrap(renameRequirement(msg.id, msg.title)); return true; }
  if (msg?.type === 'req:archive') { wrap(setArchive(msg.id, true)); return true; }
  if (msg?.type === 'req:unarchive') { wrap(setArchive(msg.id, false)); return true; }
  if (msg?.type === 'req:delete') { wrap(deleteRequirement(msg.id)); return true; }
  if (msg?.type === 'link:add') { wrap(addLinkToRequirement(msg.id, msg.link)); return true; }
  if (msg?.type === 'link:remove') { wrap(removeLink(msg.id, msg.linkId)); return true; }
});

async function createRequirement(title) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const req = { id, title: title?.trim() || 'Untitled', archived: false, createdAt: Date.now() };
  base.requirements.unshift(req);
  base.linksByReq[id] = [];
  base.lastSelectedRequirementId = id;
  await chrome.storage.local.set({ db: base });
  return req;
}

async function setLastSelected(id) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  base.lastSelectedRequirementId = id;
  await chrome.storage.local.set({ db: base });
  return true;
}

async function renameRequirement(id, title) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  const i = base.requirements.findIndex(r => r.id === id);
  if (i === -1) throw new Error('未找到需求');
  base.requirements[i].title = title?.trim() || base.requirements[i].title;
  await chrome.storage.local.set({ db: base });
  return base.requirements[i];
}

async function setArchive(id, val) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  const i = base.requirements.findIndex(r => r.id === id);
  if (i === -1) throw new Error('未找到需求');
  base.requirements[i].archived = !!val;
  await chrome.storage.local.set({ db: base });
  return base.requirements[i];
}

async function deleteRequirement(id) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  base.requirements = base.requirements.filter(r => r.id !== id);
  delete base.linksByReq[id];
  if (base.lastSelectedRequirementId === id) base.lastSelectedRequirementId = null;
  await chrome.storage.local.set({ db: base });
  return true;
}

async function addLinkToRequirement(id, { title, url, favicon }) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  if (!base.linksByReq[id]) base.linksByReq[id] = [];
  const link = {
    id: 'lnk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: (title || url || 'Link').slice(0, 200),
    url,
    favicon: favicon || '',
    addedAt: Date.now(),
  };
  // 去重：同一需求里同一URL不重复
  const exists = base.linksByReq[id].some(l => l.url === url);
  if (!exists) base.linksByReq[id].unshift(link);
  await chrome.storage.local.set({ db: base });
  return link;
}

async function removeLink(id, linkId) {
  const { db } = await chrome.storage.local.get('db');
  const base = db || DEFAULT_DB;
  base.linksByReq[id] = (base.linksByReq[id] || []).filter(l => l.id !== linkId);
  await chrome.storage.local.set({ db: base });
  return true;
}

function notify(message) {
  chrome.action.setBadgeText({ text: '✔' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
  console.log('[Management Helper]', message);
}