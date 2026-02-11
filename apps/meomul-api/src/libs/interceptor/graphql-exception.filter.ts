import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
	public catch(exception: unknown, host: ArgumentsHost): GraphQLError {
		const { message, statusCode } = this.resolveError(exception, host);
		return new GraphQLError(message, {
			extensions: {
				success: false,
				message,
				code: this.mapStatusToCode(statusCode),
			},
		});
	}

	private resolveError(exception: unknown, _host: ArgumentsHost): { message: string; statusCode: number } {
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
		switch (statusCode) {
			case HttpStatus.BAD_REQUEST:
				return 'BAD_USER_INPUT';
			case HttpStatus.UNAUTHORIZED:
				return 'UNAUTHENTICATED';
			case HttpStatus.FORBIDDEN:
				return 'FORBIDDEN';
			case HttpStatus.NOT_FOUND:
				return 'NOT_FOUND';
			case HttpStatus.CONFLICT:
				return 'CONFLICT';
			default:
				return 'INTERNAL_SERVER_ERROR';
		}
	}
}
