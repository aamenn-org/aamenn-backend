import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UnifiedSuccessResponseDto } from '../dto/unified-response.dto';

/**
 * Global Response Transform Interceptor
 * 
 * Wraps all successful controller responses in a unified format:
 * { success: true, data: T, message?, meta? }
 * 
 * Handles special cases:
 * - Already wrapped responses (pass through)
 * - Responses with pagination metadata
 * - Responses with custom messages
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  UnifiedSuccessResponseDto<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<UnifiedSuccessResponseDto<T>> {
    return next.handle().pipe(
      map((data) => {
        // If response is already wrapped (has success field), pass through
        if (data && typeof data === 'object' && 'success' in data) {
          return data as UnifiedSuccessResponseDto<T>;
        }

        // Check if data contains pagination metadata
        if (data && typeof data === 'object' && 'pagination' in data) {
          const { pagination, ...rest } = data as any;
          return {
            success: true,
            data: rest,
            meta: { pagination },
          };
        }

        // Check if data contains a message field
        if (data && typeof data === 'object' && 'message' in data && 'success' in data) {
          // Already properly formatted
          return data as UnifiedSuccessResponseDto<T>;
        }

        // Standard wrapping
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
