import { app, BrowserWindow, clipboard, ipcMain, nativeImage, Notification, shell } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

type ClipItem = {
  id: string;
  type: 'text' | 'image';
  content: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  copyCount: number;
  pinned: boolean;
  size: number;
};

const HISTORY_LIMIT = 200;
const POLL_INTERVAL_MS = 750;

app.setName('Clip History');

let mainWindow: BrowserWindow | null = null;
let history: ClipItem[] = [];
let lastSignature = '';
let pollTimer: NodeJS.Timeout | null = null;
let isPaused = false;

const __dirname = dirname(fileURLToPath(import.meta.url));

function historyPath() {
  return join(app.getPath('userData'), 'clipboard-history.json');
}

function signatureFor(type: ClipItem['type'], content: string) {
  return createHash('sha256').update(type).update('\0').update(content).digest('hex');
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function buildTextItem(content: string): ClipItem {
  const now = Date.now();
  return {
    id: randomUUID(),
    type: 'text',
    content,
    preview: content.slice(0, 180),
    createdAt: now,
    updatedAt: now,
    copyCount: 1,
    pinned: false,
    size: Buffer.byteLength(content, 'utf8'),
  };
}

function buildImageItem(dataUrl: string): ClipItem {
  const now = Date.now();
  return {
    id: randomUUID(),
    type: 'image',
    content: dataUrl,
    preview: dataUrl,
    createdAt: now,
    updatedAt: now,
    copyCount: 1,
    pinned: false,
    size: Buffer.byteLength(dataUrl, 'utf8'),
  };
}

async function loadHistory() {
  try {
    const raw = await readFile(historyPath(), 'utf8');
    const parsed = JSON.parse(raw) as ClipItem[];
    history = parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.content === 'string')
      .slice(0, HISTORY_LIMIT);
  } catch {
    history = [];
  }
}

async function saveHistory() {
  const path = historyPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(history, null, 2), 'utf8');
}

function sortHistory(items = history) {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function publishHistory() {
  mainWindow?.webContents.send('history:changed', sortHistory());
}

async function upsertItem(next: ClipItem) {
  const signature = signatureFor(next.type, next.content);
  const existing = history.find((item) => signatureFor(item.type, item.content) === signature);

  if (existing) {
    existing.updatedAt = Date.now();
    existing.copyCount += 1;
    lastSignature = signature;
  } else {
    history.unshift(next);
    lastSignature = signature;
  }

  const pinned = history.filter((item) => item.pinned);
  const unpinned = history.filter((item) => !item.pinned).slice(0, Math.max(0, HISTORY_LIMIT - pinned.length));
  history = sortHistory([...pinned, ...unpinned]).slice(0, HISTORY_LIMIT);
  await saveHistory();
  publishHistory();
}

async function captureClipboard() {
  if (isPaused) return;

  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const dataUrl = image.resize({ width: Math.min(360, image.getSize().width) }).toDataURL();
    const signature = signatureFor('image', dataUrl);
    if (signature !== lastSignature) {
      await upsertItem(buildImageItem(dataUrl));
    }
    return;
  }

  const text = normalizeText(clipboard.readText());
  if (!text) return;
  const signature = signatureFor('text', text);
  if (signature !== lastSignature) {
    await upsertItem(buildTextItem(text));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 780,
    minHeight: 520,
    title: 'Clip History',
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('history:list', () => sortHistory());

ipcMain.handle('history:copy', async (_event, id: string) => {
  const item = history.find((entry) => entry.id === id);
  if (!item) return false;
  isPaused = true;
  if (item.type === 'text') {
    clipboard.writeText(item.content);
  } else {
    clipboard.writeImage(nativeImage.createFromDataURL(item.content));
  }
  item.updatedAt = Date.now();
  item.copyCount += 1;
  await saveHistory();
  publishHistory();
  setTimeout(() => {
    lastSignature = signatureFor(item.type, item.content);
    isPaused = false;
  }, 900);
  return true;
});

ipcMain.handle('history:remove', async (_event, id: string) => {
  history = history.filter((item) => item.id !== id);
  await saveHistory();
  publishHistory();
});

ipcMain.handle('history:clear', async () => {
  history = history.filter((item) => item.pinned);
  await saveHistory();
  publishHistory();
});

ipcMain.handle('history:pin', async (_event, id: string) => {
  const item = history.find((entry) => entry.id === id);
  if (item) {
    item.pinned = !item.pinned;
    await saveHistory();
    publishHistory();
  }
});

ipcMain.handle('app:show-data-file', async () => {
  await shell.showItemInFolder(historyPath());
});

app.whenReady().then(async () => {
  await loadHistory();
  createWindow();
  pollTimer = setInterval(() => {
    void captureClipboard();
  }, POLL_INTERVAL_MS);
  void captureClipboard();

  if (Notification.isSupported()) {
    new Notification({ title: 'Clip History', body: 'クリップボード履歴の保存を開始しました。' }).show();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer);
});
