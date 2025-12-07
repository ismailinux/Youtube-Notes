export interface Bookmark {
  id: string;
  timestamp: number;
  note: string;
  createdAt: number;
  aiExplanation?: string;
  screenshot?: string;
}

export interface VideoData {
  videoId: string;
  title: string;
  url: string;
  bookmarks: Bookmark[];
}

export interface StorageData {
  [videoId: string]: VideoData;
}

export interface Settings {
  apiKey?: string;
}