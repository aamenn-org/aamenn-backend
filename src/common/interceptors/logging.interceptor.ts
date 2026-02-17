import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logging Interceptor
 * Logs HTTP requests and responses with proper sanitization.
 *
 * SECURITY:
 * - Never log request bodies (may contain encrypted data)
 * - Never log authorization headers
 * - Never log encrypted blobs or keys
 * - Only log method, path, status, timing, and sanitized metadata
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const now = Date.now();
    const userAgent = request.headers['user-agent'] || 'unknown';

    // Extract user ID from JWT if available (for audit trail)
    const userId = request.user?.userId || 'anonymous';

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const delay = Date.now() - now;
          const statusCode = response.statusCode;

          // Structured logging with sanitized metadata
          const logData = {
            method,
            url: this.sanitizeUrl(url),
            statusCode,
            duration: `${delay}ms`,
            userId,
            ip: this.sanitizeIp(ip),
            userAgent: this.sanitizeUserAgent(userAgent),
          };

          // Log level based on status code
          if (statusCode >= 500) {
            this.logger.error(`Server Error: ${JSON.stringify(logData)}`);
          } else if (statusCode >= 400) {
            this.logger.warn(`Client Error: ${JSON.stringify(logData)}`);
          } else {
            this.logger.log(`${method} ${this.sanitizeUrl(url)} ${statusCode} - ${delay}ms`);
          }
        },
        error: (error) => {
          const delay = Date.now() - now;
          
          // Log error without exposing sensitive details
          this.logger.error(
            `${method} ${this.sanitizeUrl(url)} ERROR - ${delay}ms - ${error.message || 'Unknown error'}`
          );
        },
      }),
    );
  }

  /**
   * Sanitize URL to remove sensitive query parameters
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url, 'http://localhost');
      
      // Remove sensitive query parameters
      const sensitiveParams = ['token', 'authorization', 'key', 'secret', 'password'];
      sensitiveParams.forEach(param => {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '[REDACTED]');
        }
      });
      
      return urlObj.pathname + (urlObj.search || '');
    } catch {
      // If URL parsing fails, return path only
      return url.split('?')[0];
    }
  }

  /**
   * Sanitize IP address (mask last octet for privacy)
   */
  private sanitizeIp(ip: string): string {
    if (!ip) return 'unknown';
    
    // For IPv4, mask last octet
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
    
    // For IPv6 or other formats, return first part only
    return ip.split(':')[0] + ':xxx';
  }

  /**
   * Sanitize user agent (keep only browser/OS info, remove version details)
   */
  private sanitizeUserAgent(userAgent: string): string {
    if (!userAgent || userAgent === 'unknown') return 'unknown';
    
    // Extract only major browser/OS info
    const match = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera|MSIE|Trident|Mobile|Android|iOS)/i);
    return match ? match[0] : 'other';
  }
}
