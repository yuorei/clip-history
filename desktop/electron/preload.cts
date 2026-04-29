import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('clipHistory', {
  list: () => ipcRenderer.invoke('history:list') as Promise<ClipItem[]>,
  copy: (id: string) => ipcRenderer.invoke('history:copy', id) as Promise<boolean>,
  remove: (id: string) => ipcRenderer.invoke('history:remove', id) as Promise<void>,
  clear: () => ipcRenderer.invoke('history:clear') as Promise<void>,
  pin: (id: string) => ipcRenderer.invoke('history:pin', id) as Promise<void>,
  showDataFile: () => ipcRenderer.invoke('app:show-data-file') as Promise<void>,
  onChanged: (callback: (items: ClipItem[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, items: ClipItem[]) => callback(items);
    ipcRenderer.on('history:changed', listener);
    return () => ipcRenderer.removeListener('history:changed', listener);
  },
});
