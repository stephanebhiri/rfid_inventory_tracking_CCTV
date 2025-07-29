/**
 * Frontend timezone conversion utilities for CCTV timestamps
 * Converts UTC timestamps to CEST/CET for display purposes only
 */

/**
 * Determines if a given date is in Daylight Saving Time (DST) for Central European Time
 * DST runs from last Sunday in March to last Sunday in October
 */
function isDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  
  // Last Sunday in March (DST starts)
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  
  // Last Sunday in October (DST ends)
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  
  return date >= marchLastSunday && date < octoberLastSunday;
}

/**
 * Converts UTC timestamp to CEST/CET timestamp for display
 * @param utcTimestamp - UTC timestamp in seconds
 * @returns Local timestamp in seconds (CEST/CET)
 */
export function utcToLocalTimestamp(utcTimestamp: number): number {
  const utcDate = new Date(utcTimestamp * 1000);
  const offset = isDST(utcDate) ? 2 : 1; // CEST = UTC+2, CET = UTC+1
  return utcTimestamp + (offset * 3600); // Add offset in seconds
}

/**
 * Formats UTC timestamp as local date string (CEST/CET)
 * @param utcTimestamp - UTC timestamp in seconds
 * @param locale - Locale for formatting (default: 'fr-FR')
 * @returns Formatted local date string
 */
export function formatLocalDateTime(utcTimestamp: number, locale: string = 'fr-FR'): string {
  const localTimestamp = utcToLocalTimestamp(utcTimestamp);
  return new Date(localTimestamp * 1000).toLocaleString(locale);
}

/**
 * Formats UTC timestamp as local time string (CEST/CET)
 * @param utcTimestamp - UTC timestamp in seconds
 * @param locale - Locale for formatting (default: 'fr-FR')
 * @returns Formatted local time string
 */
export function formatLocalTime(utcTimestamp: number, locale: string = 'fr-FR'): string {
  const localTimestamp = utcToLocalTimestamp(utcTimestamp);
  return new Date(localTimestamp * 1000).toLocaleTimeString(locale);
}