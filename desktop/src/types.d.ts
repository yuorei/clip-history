export type ClipItem = {
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

declare global {
  interface Window {
    clipHistory: {
      list: () => Promise<ClipItem[]>;
      copy: (id: string) => Promise<boolean>;
      remove: (id: string) => Promise<void>;
      clear: () => Promise<void>;
      pin: (id: string) => Promise<void>;
      showDataFile: () => Promise<void>;
      onChanged: (callback: (items: ClipItem[]) => void) => () => void;
    };
  }
}
