import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
	public catch(exception: unknown): GraphQLError {
		const { message, statusCode } = this.resolveError(exception);
		return new GraphQLError(message, {
			extensions: {
				success: false,
				message,
				code: this.mapStatusToCode(statusCode),
			},
		});
	}

	private resolveError(exception: unknown): { message: string; statusCode: number } {
		let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
		let message = 'Internal server error';

		if (exception instanceof HttpException) {
			statusCode = exception.getStatus();
			const response = exception.getResponse();

			if (typeof response === 'string') {
				message = response;
			} else if (response && typeof response === 'object') {
				const responseMessage = (response as { message?: string | string[] }).message;
				if (Array.isArray(responseMessage)) {
					message = responseMessage[0] ?? exception.message;
				} else if (typeof responseMessage === 'string') {
					message = responseMessage;
				} else if ('error' in response) {
					message = String((response as { error?: string }).error ?? exception.message);
				}
			} else {
				message = exception.message;
			}
		} else if (exception instanceof Error) {
			message = exception.message;
		}

		return { message, statusCode };
	}

	private mapStatusToCode(statusCode: number): string {
		const statusCodeToGraphCode: Record<number, string> = {
			[HttpStatus.BAD_REQUEST]: 'BAD_USER_INPUT',
			[HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
			[HttpStatus.FORBIDDEN]: 'FORBIDDEN',
			[HttpStatus.NOT_FOUND]: 'NOT_FOUND',
			[HttpStatus.CONFLICT]: 'CONFLICT',
		};
		return statusCodeToGraphCode[statusCode] ?? 'INTERNAL_SERVER_ERROR';
	}
}
