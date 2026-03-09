import { plainToInstance } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	MinLength,
	validateSync,
} from 'class-validator';

enum Environment {
	Development = 'development',
	Production = 'production',
	Test = 'test',
}

class EnvironmentVariables {
	@IsEnum(Environment)
	@IsOptional()
	NODE_ENV: Environment = Environment.Development;

	@IsInt()
	@IsOptional()
	PORT_API: number = 3001;

	@IsString()
	@IsOptional()
	MONGO_PROD?: string;

	@IsString()
	@IsOptional()
	MONGO_DEV?: string;

	@IsString()
	@MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
	JWT_SECRET: string;

	@IsString()
	@IsOptional()
	JWT_EXPIRES_IN?: string;

	@IsString()
	@MinLength(32, { message: 'COOKIE_SECRET must be at least 32 characters' })
	@IsOptional()
	COOKIE_SECRET?: string;

	@IsUrl({ require_tld: false })
	@IsOptional()
	FRONTEND_URL?: string;

	@IsUrl({ require_tld: false })
	@IsOptional()
	REDIS_URL?: string;

	@IsString()
	@IsOptional()
	SOCKET_CORS_ORIGINS?: string;

	@IsString()
	@IsOptional()
	BATCH_ALERT_WEBHOOK_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
	const isProduction = config['NODE_ENV'] === 'production';

	// Production-specific hard requirements
	if (isProduction) {
		const required = ['MONGO_PROD', 'JWT_SECRET', 'COOKIE_SECRET', 'FRONTEND_URL'] as const;
		for (const key of required) {
			if (!config[key]) {
				console.error(`❌ [env] FATAL: ${key} is required in production`);
				process.exit(1);
			}
		}
	}

	// class-validator's @IsOptional() only skips null/undefined, not empty strings.
	// Convert empty strings to undefined so optional URL fields don't fail validation.
	const sanitized = Object.fromEntries(
		Object.entries(config).map(([k, v]) => [k, v === '' ? undefined : v]),
	);

	const validated = plainToInstance(EnvironmentVariables, sanitized, {
		enableImplicitConversion: true,
	});

	const errors = validateSync(validated, { skipMissingProperties: false });

	if (errors.length > 0) {
		const messages = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n  ');
		console.error(`❌ Invalid environment variables:\n  ${messages}`);
		process.exit(1);
	}

	return validated;
}
