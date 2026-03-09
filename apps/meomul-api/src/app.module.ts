import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '@nestjs/cache-manager';
import type { CacheOptions } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './libs/guards/gql-throttler.guard';
import type { Request, Response } from 'express';
import { AppResolver } from './app.resolver';
import { ComponentsModule } from './components/components.module';
import { AuthModule } from './components/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { SocketModule } from './socket/socket.module';
import { HealthModule } from './health/health.module';
import { validateEnv } from './config/env.validation';
import { GraphqlExceptionFilter } from './libs/interceptor/graphql-exception.filter';
import { LoggingInterceptor } from './libs/interceptor/logging.interceptor';
import { AuthGuard } from './components/auth/guards/auth.guard';
import { RolesGuard } from './components/auth/guards/roles.guard';

@Module({
	imports: [
		CacheModule.registerAsync({
			isGlobal: true,
			useFactory: (): CacheOptions => {
				const logger = new Logger('CacheModule');
				const ttl = 300000;
				const max = 200;
				const redisUrl = process.env.REDIS_URL?.trim();

				if (!redisUrl) {
					logger.log('No REDIS_URL configured — using in-memory cache');
					return { ttl, max };
				}

				try {
					const redisStore = new KeyvRedis(redisUrl);
					const keyvStore = new Keyv({
						store: redisStore,
						namespace: 'meomul:api-cache',
					});

					// Fallback to in-memory on Redis runtime errors
					keyvStore.on('error', (err: unknown) => {
						logger.error('Redis cache error; operations will use in-memory fallback', err);
					});

					logger.log('Redis cache store initialised');
					return {
						ttl,
						max,
						stores: [keyvStore],
					};
				} catch (err) {
					logger.error('Failed to create Redis cache store; falling back to in-memory cache', err);
					return { ttl, max };
				}
			},
		}),
		ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
		ThrottlerModule.forRoot({
			throttlers: [
				{ name: 'short', ttl: 1000, limit: 10 },
				{ name: 'medium', ttl: 10000, limit: 50 },
				{ name: 'long', ttl: 60000, limit: 200 },
			],
		}),
		GraphQLModule.forRoot({
			autoSchemaFile: join(process.cwd(), 'apps/meomul-api/src/schema.gql'),
			driver: ApolloDriver,
			sortSchema: true,
			playground: process.env.NODE_ENV === 'development',
			introspection: process.env.NODE_ENV === 'development',
			context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
		}),
		ComponentsModule,
		AuthModule,
		DatabaseModule,
		SocketModule,
		HealthModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		AppResolver,
		{
			provide: APP_FILTER,
			useClass: GraphqlExceptionFilter,
		},
		{
			provide: APP_INTERCEPTOR,
			useClass: LoggingInterceptor,
		},
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		{
			provide: APP_GUARD,
			useClass: RolesGuard,
		},
		{
			provide: APP_GUARD,
			useClass: GqlThrottlerGuard,
		},
	],
})
export class AppModule {}
