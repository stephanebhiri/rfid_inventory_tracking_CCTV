/**
 * Timezone conversion utilities for CCTV service
 * Handles conversion between UTC and CEST/CET based on DST rules
 */

/**
 * Determines if a given date is in Daylight Saving Time (DST) for Central European Time
 * DST runs from last Sunday in March to last Sunday in October
 * @param {Date} date - The date to check
 * @returns {boolean} - True if date is in DST period (CEST), false if in standard time (CET)
 */
function isDST(date) {
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
 * Gets the timezone offset for Central European Time based on DST
 * @param {Date} date - The date to get offset for
 * @returns {number} - Offset in hours (1 for CET, 2 for CEST)
 */
function getTimezoneOffset(date) {
  return isDST(date) ? 2 : 1; // CEST = UTC+2, CET = UTC+1
}

/**
 * Converts UTC timestamp to Central European Time (CEST/CET)
 * @param {number} utcTimestamp - UTC timestamp in seconds
 * @returns {number} - Local timestamp in seconds
 */
function utcToCEST(utcTimestamp) {
  const utcDate = new Date(utcTimestamp * 1000);
  const offset = getTimezoneOffset(utcDate);
  return utcTimestamp + (offset * 3600); // Add offset in seconds
}

/**
 * Converts Central European Time (CEST/CET) timestamp to UTC
 * @param {number} localTimestamp - Local timestamp in seconds
 * @returns {number} - UTC timestamp in seconds
 */
function cestToUTC(localTimestamp) {
  // First approximation - assume current timezone
  const localDate = new Date(localTimestamp * 1000);
  const offset = getTimezoneOffset(localDate);
  const utcTimestamp = localTimestamp - (offset * 3600);
  
  // Verify the conversion is correct (handle edge cases around DST transitions)
  const verifyDate = new Date(utcTimestamp * 1000);
  const verifyOffset = getTimezoneOffset(verifyDate);
  
  if (verifyOffset !== offset) {
    // DST transition edge case - recalculate with correct offset
    return localTimestamp - (verifyOffset * 3600);
  }
  
  return utcTimestamp;
}

/**
 * Formats a UTC timestamp as a local date object in CEST/CET
 * @param {number} utcTimestamp - UTC timestamp in seconds
 * @returns {Date} - Date object representing local time
 */
function utcToLocalDate(utcTimestamp) {
  const localTimestamp = utcToCEST(utcTimestamp);
  return new Date(localTimestamp * 1000);
}

/**
 * Creates a UTC timestamp from local date components
 * @param {number} year - Local year
 * @param {number} month - Local month (0-11)
 * @param {number} day - Local day
 * @param {number} hour - Local hour
 * @param {number} minute - Local minute
 * @param {number} second - Local second
 * @returns {number} - UTC timestamp in seconds
 */
function localDateToUTC(year, month, day, hour = 0, minute = 0, second = 0) {
  // Create local timestamp (naive - without timezone)
  const localDate = new Date(year, month, day, hour, minute, second);
  const localTimestamp = Math.floor(localDate.getTime() / 1000);
  
  // Convert to UTC
  return cestToUTC(localTimestamp);
}

module.exports = {
  isDST,
  getTimezoneOffset,
  utcToCEST,
  cestToUTC,
  utcToLocalDate,
  localDateToUTC
};