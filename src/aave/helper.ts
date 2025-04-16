import { format } from 'date-fns';

/**
 * Format date for TSV
 */
export function formatTsvDate(date: Date): string {
  return format(date, 'yy/MM/dd HH:mm:ss');
}