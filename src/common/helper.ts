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
