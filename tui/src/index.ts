#!/usr/bin/env node
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

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

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const historyPath = getHistoryPath();
let items: ClipItem[] = [];
let selectedIndex = 0;
let query = '';
let status = '';
let isSearching = false;

const clear = '\x1b[2J\x1b[H';
const inverse = '\x1b[7m';
const reset = '\x1b[0m';
const dim = '\x1b[2m';

function getHistoryPath() {
  if (process.env.CLIP_HISTORY_PATH) return process.env.CLIP_HISTORY_PATH;
  if (isMac) return join(homedir(), 'Library/Application Support/Clip History/clipboard-history.json');
  if (isLinux) {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
    return join(configHome, 'Clip History', 'clipboard-history.json');
  }
  return join(homedir(), '.clip-history', 'clipboard-history.json');
}

async function loadHistory() {
  try {
    const raw = await readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw) as ClipItem[];
    items = parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.content === 'string')
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  } catch {
    items = [];
  }
}

function visibleItems() {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    if (item.type === 'image') return 'image'.includes(normalized);
    return item.content.toLowerCase().includes(normalized);
  });
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(value: string, width: number) {
  const singleLine = sanitizeTerminalText(value).replace(/\s+/g, ' ').trim();
  if (singleLine.length <= width) return singleLine.padEnd(width, ' ');
  return `${singleLine.slice(0, Math.max(0, width - 1))}…`;
}

function sanitizeTerminalText(value: string) {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/gu, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/gu, '');
}

function render() {
  const columns = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const filtered = visibleItems();
  selectedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));
  const selected = filtered[selectedIndex];
  const listHeight = Math.max(6, rows - 9);
  const startIndex = Math.max(0, Math.min(selectedIndex, filtered.length - listHeight));
  const endIndex = Math.min(filtered.length, startIndex + listHeight);
  const previewWidth = Math.max(20, columns - 45);

  let output = clear;
  output += 'Clip History TUI\n';
  output += `${dim}${historyPath}${reset}\n\n`;
  output += `Search: ${query}${isSearching ? '_' : ''}\n`;
  output += `${dim}j/k or ↑/↓ move  g/G top/bottom  / search  enter copy+quit  r reload  q quit${reset}\n\n`;

  if (!filtered.length) {
    output += 'No clipboard history found.\n';
  } else {
    output += `${'Type'.padEnd(7)} ${'Updated'.padEnd(12)} ${'Size'.padEnd(10)} Preview ${dim}${selectedIndex + 1}/${filtered.length}${reset}\n`;
    output += `${dim}${'-'.repeat(Math.max(0, columns - 1))}${reset}\n`;
    for (let index = startIndex; index < endIndex; index += 1) {
      const item = filtered[index];
      const type = item.pinned ? `${item.type}*` : item.type;
      const preview = item.type === 'image' ? '[image clip]' : item.preview || '(empty text)';
      const line = `${type.padEnd(7)} ${formatDate(item.updatedAt).padEnd(12)} ${formatBytes(item.size).padEnd(10)} ${truncate(preview, previewWidth)}`;
      output += index === selectedIndex ? `${inverse}${line}${reset}\n` : `${line}\n`;
    }
  }

  output += `\n${dim}${'-'.repeat(Math.max(0, columns - 1))}${reset}\n`;
  if (selected) {
    output += `Selected: ${selected.type}${selected.pinned ? ' pinned' : ''}, copied ${selected.copyCount} times\n`;
    output += selected.type === 'image' ? 'Press enter to copy the image back to the clipboard.\n' : `${truncate(selected.content, columns - 1)}\n`;
  }
  if (status) output += `\n${status}\n`;

  process.stdout.write(output);
}

function runProcess(command: string, args: string[], input?: string | Buffer) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk: Buffer) => {
      error += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(error || `${command} exited with ${code}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function copyText(value: string) {
  if (isMac) {
    await runProcess('pbcopy', [], value);
    return;
  }
  if (isLinux) {
    await runFirstAvailable([
      { command: 'wl-copy', args: [], input: value },
      { command: 'xclip', args: ['-selection', 'clipboard'], input: value },
      { command: 'xsel', args: ['--clipboard', '--input'], input: value },
    ]);
    return;
  }
  throw new Error(`Text copy is not supported on ${process.platform}.`);
}

async function copyImage(dataUrl: string) {
  const match = /^data:image\/png;base64,(.+)$/u.exec(dataUrl);
  if (!match) throw new Error('Only PNG data URLs can be copied.');
  const png = Buffer.from(match[1], 'base64');
  if (isLinux) {
    await runFirstAvailable([
      { command: 'wl-copy', args: ['--type', 'image/png'], input: png },
      { command: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png'], input: png },
    ]);
    return;
  }
  if (!isMac) throw new Error(`Image copy is not supported on ${process.platform}.`);
  const filePath = join(tmpdir(), `clip-history-${Date.now()}.png`);
  await writeFile(filePath, png);
  try {
    await runProcess('osascript', ['-e', `set the clipboard to (read (POSIX file "${escapeAppleScriptString(filePath)}") as «class PNGf»)`]);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

async function runFirstAvailable(candidates: { command: string; args: string[]; input: string | Buffer }[]) {
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await runProcess(candidate.command, candidate.args, candidate.input);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`No clipboard command worked. Install wl-clipboard, xclip, or xsel. ${errors.join(' ')}`);
}

function escapeAppleScriptString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function copySelected() {
  const selected = visibleItems()[selectedIndex];
  if (!selected) return false;
  try {
    if (selected.type === 'text') await copyText(selected.content);
    else await copyImage(selected.content);
    status = 'Copied to clipboard.';
    return true;
  } catch (error) {
    status = error instanceof Error ? error.message : 'Copy failed.';
    return false;
  }
}

function quit() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write('\x1b[?25h');
  process.stdout.write(clear);
  process.exit(0);
}

async function handleKey(input: Buffer) {
  const key = input.toString('utf8');
  status = '';

  if (key === '\u0003' || (!isSearching && key === 'q')) quit();
  if (key === '\r') {
    if (isSearching) isSearching = false;
    else if (await copySelected()) quit();
    render();
    return;
  }
  if (!isSearching && (key === '\u001b[A' || key === 'k')) selectedIndex = Math.max(0, selectedIndex - 1);
  else if (!isSearching && (key === '\u001b[B' || key === 'j')) selectedIndex = Math.min(Math.max(0, visibleItems().length - 1), selectedIndex + 1);
  else if (!isSearching && key === 'g') selectedIndex = 0;
  else if (!isSearching && key === 'G') selectedIndex = Math.max(0, visibleItems().length - 1);
  else if (!isSearching && key === '/') isSearching = true;
  else if (!isSearching && key === 'r') {
    await loadHistory();
    status = 'Reloaded.';
  } else if (isSearching && key === '\u007f') {
    query = query.slice(0, -1);
    selectedIndex = 0;
  } else if (isSearching && key === '\u001b') {
    isSearching = false;
  } else if (isSearching && key.length === 1 && key >= ' ') {
    query += key;
    selectedIndex = 0;
  }

  render();
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('Clip History TUI requires an interactive terminal.\n');
    process.exitCode = 1;
    return;
  }
  await loadHistory();
  process.stdout.write('\x1b[?25l');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (input: Buffer) => {
    void handleKey(input);
  });
  process.stdout.on('resize', render);
  render();
}

void main();
