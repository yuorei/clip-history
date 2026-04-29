import './style.css';
import type { ClipItem } from './types';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

let items: ClipItem[] = [];
let query = '';
let selectedType: 'all' | 'text' | 'image' = 'all';
let previewItemId = '';
let previewZoom = 1;
let toastTimer = 0;

const formatDate = (value: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return map[char];
  });

const visibleItems = () => {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesType = selectedType === 'all' || item.type === selectedType;
    const matchesQuery =
      !normalized ||
      item.preview.toLowerCase().includes(normalized) ||
      item.content.toLowerCase().includes(normalized);
    return matchesType && matchesQuery;
  });
};

const showToast = (message: string) => {
  const toast = document.querySelector<HTMLDivElement>('[data-toast]');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
};

const setPreviewZoom = (nextZoom: number) => {
  previewZoom = Math.min(5, Math.max(0.25, nextZoom));
  render();
};

const renderItem = (item: ClipItem) => {
  const preview =
    item.type === 'image'
      ? `<button type="button" class="image-preview-button" data-action="preview" aria-label="画像を大きく表示"><img src="${item.preview}" alt="保存された画像クリップ" /></button>`
      : `<p>${escapeHtml(item.preview || '(空のテキスト)')}</p>`;

  return `
    <article class="clip ${item.type}" data-id="${item.id}">
      <div class="clip-preview">${preview}</div>
      <div class="clip-meta">
        <span>${item.type === 'text' ? 'Text' : 'Image'}</span>
        <span>${formatDate(item.updatedAt)}</span>
        <span>${formatBytes(item.size)}</span>
        <span>${item.copyCount}回</span>
      </div>
      <div class="clip-actions">
        <button type="button" data-action="copy" title="クリップボードへ戻す" aria-label="クリップボードへ戻す">Copy</button>
        <button type="button" data-action="pin" title="ピン留め" aria-label="ピン留め">${item.pinned ? 'Pinned' : 'Pin'}</button>
        <button type="button" data-action="remove" class="danger" title="削除" aria-label="削除">Delete</button>
      </div>
    </article>
  `;
};

const render = () => {
  const filtered = visibleItems();
  const previewItem = items.find((item) => item.id === previewItemId && item.type === 'image');
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>Clip History</h1>
          <p>コピーしたテキストと画像を自動で保存します。</p>
        </div>
        <div class="stats">
          <strong>${items.length}</strong>
          <span>保存済み</span>
        </div>
      </header>

      <section class="toolbar" aria-label="履歴の操作">
        <label class="search">
          <span>検索</span>
          <input data-search type="search" value="${escapeHtml(query)}" placeholder="内容で絞り込み" />
        </label>
        <div class="segments" role="group" aria-label="種類">
          ${(['all', 'text', 'image'] as const)
            .map(
              (type) =>
                `<button type="button" data-filter="${type}" class="${selectedType === type ? 'active' : ''}">${
                  type === 'all' ? 'All' : type === 'text' ? 'Text' : 'Image'
                }</button>`,
            )
            .join('')}
        </div>
        <button type="button" data-clear class="subtle">ピン以外を削除</button>
        <button type="button" data-open class="subtle">保存場所</button>
      </section>

      <section class="history" aria-live="polite">
        ${
          filtered.length
            ? filtered.map(renderItem).join('')
            : `<div class="empty">
                <h2>まだ履歴がありません</h2>
                <p>別のアプリでテキストや画像をコピーすると、ここに追加されます。</p>
              </div>`
        }
      </section>
      ${
        previewItem
          ? `<div class="preview-modal" data-preview-backdrop role="dialog" aria-modal="true" aria-label="画像プレビュー">
              <div class="preview-dialog">
                <div class="preview-header">
                  <div>
                    <strong>Image</strong>
                    <span>${formatDate(previewItem.updatedAt)} / ${formatBytes(previewItem.size)}</span>
                  </div>
                  <div class="preview-tools" aria-label="ズーム操作">
                    <button type="button" data-preview-zoom="out" aria-label="縮小">-</button>
                    <button type="button" data-preview-zoom="fit" aria-label="画面に合わせる">Fit</button>
                    <span>${Math.round(previewZoom * 100)}%</span>
                    <button type="button" data-preview-zoom="in" aria-label="拡大">+</button>
                  </div>
                  <button type="button" data-preview-close aria-label="閉じる">Close</button>
                </div>
                <div class="preview-canvas">
                  <img src="${previewItem.content}" alt="保存された画像クリップの拡大プレビュー" style="width: ${previewZoom * 100}%; max-width: none; max-height: none;" />
                </div>
              </div>
            </div>`
          : ''
      }
      <div class="toast" data-toast></div>
    </main>
  `;
};

app.addEventListener('input', (event) => {
  const target = event.target as HTMLElement;
  if (target.matches('[data-search]')) {
    query = (target as HTMLInputElement).value;
    render();
    document.querySelector<HTMLInputElement>('[data-search]')?.focus();
  }
});

app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const filter = target.dataset.filter as typeof selectedType | undefined;
  if (filter) {
    selectedType = filter;
    render();
    return;
  }

  if (target.matches('[data-clear]')) {
    await window.clipHistory.clear();
    showToast('ピン留め以外を削除しました');
    return;
  }

  if (target.matches('[data-open]')) {
    await window.clipHistory.showDataFile();
    return;
  }

  if (target.matches('[data-preview-close]') || target.matches('[data-preview-backdrop]')) {
    previewItemId = '';
    previewZoom = 1;
    render();
    return;
  }

  const zoomAction = target.closest<HTMLElement>('[data-preview-zoom]')?.dataset.previewZoom;
  if (zoomAction === 'in') {
    setPreviewZoom(previewZoom + 0.25);
    return;
  }
  if (zoomAction === 'out') {
    setPreviewZoom(previewZoom - 0.25);
    return;
  }
  if (zoomAction === 'fit') {
    setPreviewZoom(1);
    return;
  }

  const actionTarget = target.closest<HTMLElement>('[data-action]');
  const action = actionTarget?.dataset.action;
  const id = actionTarget?.closest<HTMLElement>('[data-id]')?.dataset.id;
  if (!action || !id) return;

  if (action === 'preview') {
    previewItemId = id;
    previewZoom = 1;
    render();
    return;
  }

  if (action === 'copy') {
    await window.clipHistory.copy(id);
    showToast('クリップボードへ戻しました');
  }
  if (action === 'pin') {
    await window.clipHistory.pin(id);
  }
  if (action === 'remove') {
    await window.clipHistory.remove(id);
    showToast('削除しました');
  }
});

window.clipHistory.onChanged((nextItems) => {
  items = nextItems;
  if (previewItemId && !items.some((item) => item.id === previewItemId)) previewItemId = '';
  render();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && previewItemId) {
    previewItemId = '';
    previewZoom = 1;
    render();
  }
});

app.addEventListener(
  'wheel',
  (event) => {
    if (!previewItemId || !event.ctrlKey) return;
    event.preventDefault();
    setPreviewZoom(previewZoom + (event.deltaY < 0 ? 0.25 : -0.25));
  },
  { passive: false },
);

items = await window.clipHistory.list();
render();
