import * as fs from 'fs';
import path from 'path';

/**
 * Create export directory if it doesn't exist
 */
export function ensureExportDirectory() {
  const dir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000); // Convert to milliseconds
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}