export interface Note {
  title: string;
  content: string; // HTML content
  tags: string[];
  created: string; // ISO Date
  updated: string; // ISO Date
  author?: string;
  sourceUrl?: string;
}

export interface EnexOptions {
  version?: string;
  application?: string;
}