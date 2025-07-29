interface ErrorReport {
  message: string;
  stack?: string;
  context?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  url: string;
  userAgent: string;
  userId?: string;
}

interface NetworkError extends Error {
  status?: number;
  response?: any;
}

/**
 * Centralized error handling and reporting service
 * Handles logging, categorization, and potential reporting to external services
 */
class ErrorService {
  private errorQueue: ErrorReport[] = [];
  private maxQueueSize = 100;

  /**
   * Log an error with context
   */
  logError(
    error: Error | string, 
    context: Record<string, any> = {}, 
    severity: ErrorReport['severity'] = 'medium'
  ): void {
    const errorReport: ErrorReport = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context,
      severity,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.getCurrentUserId()
    };

    // Add to queue
    this.addToQueue(errorReport);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      const logMethod = this.getConsoleMethod(severity);
      logMethod('🚨 Error logged:', errorReport);
    }

    // In production, you'd send to monitoring service
    if (process.env.NODE_ENV === 'production' && severity === 'critical') {
      this.sendToMonitoringService(errorReport);
    }
  }

  /**
   * Handle API errors specifically
   */
  handleApiError(error: NetworkError, endpoint: string, context: Record<string, any> = {}): void {
    const severity = this.getApiErrorSeverity(error.status);
    
    this.logError(error, {
      ...context,
      endpoint,
      status: error.status,
      response: error.response,
      type: 'api_error'
    }, severity);
  }

  /**
   * Handle WebSocket errors
   */
  handleWebSocketError(error: Event | Error, context: Record<string, any> = {}): void {
    const errorMessage = error instanceof Error ? error.message : 'WebSocket connection error';
    
    this.logError(errorMessage, {
      ...context,
      type: 'websocket_error'
    }, 'medium');
  }

  /**
   * Handle validation errors
   */
  handleValidationError(field: string, value: any, rule: string): void {
    this.logError(`Validation failed for ${field}`, {
      field,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      rule,
      type: 'validation_error'
    }, 'low');
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(limit: number = 10): ErrorReport[] {
    return this.errorQueue.slice(-limit);
  }

  /**
   * Clear error queue
   */
  clearErrors(): void {
    this.errorQueue = [];
  }

  /**
   * Get error statistics
   */
  getErrorStats(): { total: number; bySeverity: Record<string, number> } {
    const bySeverity = this.errorQueue.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.errorQueue.length,
      bySeverity
    };
  }

  private addToQueue(errorReport: ErrorReport): void {
    this.errorQueue.push(errorReport);
    
    // Keep queue size manageable
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize);
    }
  }

  private getConsoleMethod(severity: ErrorReport['severity']) {
    switch (severity) {
      case 'critical':
        return console.error;
      case 'high':
        return console.error;
      case 'medium':
        return console.warn;
      case 'low':
        return console.info;
      default:
        return console.log;
    }
  }

  private getApiErrorSeverity(status?: number): ErrorReport['severity'] {
    if (!status) return 'medium';
    
    if (status >= 500) return 'high';
    if (status === 404) return 'medium';
    if (status >= 400) return 'medium';
    return 'low';
  }

  private getCurrentUserId(): string | undefined {
    // In a real app, get from auth service/context
    return undefined;
  }

  private async sendToMonitoringService(errorReport: ErrorReport): Promise<void> {
    try {
      // In production, send to your monitoring service
      // Examples: Sentry, LogRocket, Bugsnag, DataDog, etc.
      
      // Placeholder implementation
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport)
      });
    } catch (error) {
      // Don't let error reporting break the app
      console.error('Failed to send error to monitoring service:', error);
    }
  }
}

// Export singleton instance
export const errorService = new ErrorService();

// Utility functions for common error patterns
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: Record<string, any> = {}
): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    errorService.logError(error as Error, context);
    return null;
  }
};

export const handleAsyncOperation = async <T>(
  operation: () => Promise<T>,
  fallback: T,
  context: Record<string, any> = {}
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    errorService.logError(error as Error, context);
    return fallback;
  }
};