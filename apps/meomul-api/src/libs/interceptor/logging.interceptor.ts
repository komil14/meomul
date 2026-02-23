import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger(LoggingInterceptor.name);

	public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const gqlContext = GqlExecutionContext.create(context);
		const info = gqlContext.getInfo<{ fieldName?: string } | undefined>();
		const operationName = info?.fieldName ?? 'unknown';
		const start = Date.now();

		return next.handle().pipe(
			tap(() => {
				const duration = Date.now() - start;
				this.logger.log(`[GraphQL] ${operationName} ${duration}ms`);
			}),
			catchError((error: unknown) => {
				const duration = Date.now() - start;
				const errorStack = error instanceof Error ? (error.stack ?? error.message) : String(error);
				this.logger.error(`[GraphQL] ${operationName} failed ${duration}ms`, errorStack);
				throw error;
			}),
		);
	}
}
