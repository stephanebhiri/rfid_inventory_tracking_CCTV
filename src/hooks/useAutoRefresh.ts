import { useEffect, useRef } from 'react';

/**
 * A simple and reliable hook for auto-refreshing data at a given interval.
 *
 * @param callback The function to call at each interval.
 * @param interval The refresh interval in milliseconds.
 * @param enabled Whether the auto-refresh is currently active.
 */
export const useAutoRefresh = (
  callback: () => void,
  interval: number,
  enabled: boolean
) => {
  const callbackRef = useRef(callback);

  // Keep the callback reference up to date without re-triggering the effect.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // If not enabled, do nothing.
    if (!enabled) {
      return;
    }
    
    // Set up the interval.
    const intervalId = setInterval(() => {
      callbackRef.current();
    }, interval);

    // Clean up the interval when the component unmounts or dependencies change.
    return () => {
      clearInterval(intervalId);
    };
  }, [interval, enabled]); // Rerun effect only if interval or enabled status changes.
};
