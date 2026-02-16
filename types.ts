
export interface TranscriptItem {
  id: string;
  speaker: 'user' | 'model';
  text: string;
  timestamp: number;
  isPartial?: boolean;
}

export interface ClassSessionSummary {
  rawTranscript: TranscriptItem[];
  summaryMarkdown: string;
  topic: string;
  date: string;
}

export interface IntervalAnalysis {
  id: string;
  timestamp: number;
  content: string;
  timeRange: string;
  type: 'check-in' | 'milestone'; // 'check-in' = 5 min, 'milestone' = 15 min
}

export enum AppView {
  HOME = 'HOME',
  LIVE = 'LIVE',
  SUMMARY = 'SUMMARY',
  FILE_OPTIONS = 'FILE_OPTIONS',
}
