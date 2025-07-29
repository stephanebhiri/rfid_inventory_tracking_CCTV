import { useState, useCallback, useRef } from 'react';

interface RetryConfig {
  maxAttempts?: number;
  delay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
}

interface RetryState {
  isRetrying: boolean;
  attempts: number;
  lastError?: Error;
}

/**
 * Hook for handling retry logic with exponential backoff
 * Perfect for API calls, WebSocket connections, etc.
 */
export const useRetry = (config: RetryConfig = {}) => {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
    maxDelay = 30000
  } = config;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attempts: 0
  });

  const abortController = useRef<AbortController | null>(null);

  const calculateDelay = useCallback((attempt: number) => {
    const exponentialDelay = delay * Math.pow(backoffMultiplier, attempt);
    return Math.min(exponentialDelay, maxDelay);
  }, [delay, backoffMultiplier, maxDelay]);

  const executeWithRetry = useCallback(async <T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> => {
    const finalConfig = { ...config, ...customConfig };
    const finalMaxAttempts = finalConfig.maxAttempts || maxAttempts;

    // Cancel any ongoing retry
    if (abortController.current) {
      abortController.current.abort();
    }

    abortController.current = new AbortController();
    
    setState(prev => ({ ...prev, isRetrying: true, attempts: 0 }));

    for (let attempt = 0; attempt < finalMaxAttempts; attempt++) {
      try {
        const result = await operation(abortController.current.signal);
        
        // Success - reset state
        setState({ isRetrying: false, attempts: attempt + 1 });
        return result;
        
      } catch (error) {
        const isLastAttempt = attempt === finalMaxAttempts - 1;
        const currentError = error instanceof Error ? error : new Error('Unknown error');
        
        setState(prev => ({ 
          ...prev, 
          attempts: attempt + 1, 
          lastError: currentError 
        }));

        // If it's the last attempt or the operation was aborted, throw the error
        if (isLastAttempt || abortController.current?.signal.aborted) {
          setState(prev => ({ ...prev, isRetrying: false }));
          throw currentError;
        }

        // Wait before retrying (with exponential backoff)
        const retryDelay = calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // This should never be reached, but TypeScript requires it
    setState(prev => ({ ...prev, isRetrying: false }));
    throw new Error('Maximum retry attempts exceeded');
  }, [maxAttempts, calculateDelay]);

  const abort = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      setState(prev => ({ ...prev, isRetrying: false }));
    }
  }, []);

  const reset = useCallback(() => {
    abort();
    setState({ isRetrying: false, attempts: 0, lastError: undefined });
  }, [abort]);

  return {
    ...state,
    executeWithRetry,
    abort,
    reset,
    hasReachedMaxAttempts: state.attempts >= maxAttempts
  };
};