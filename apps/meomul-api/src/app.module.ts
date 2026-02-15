import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { AppResolver } from './app.resolver';
import { ComponentsModule } from './components/components.module';
import { AuthModule } from './components/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { SocketModule } from './socket/socket.module';
import { GraphqlExceptionFilter } from './libs/interceptor/graphql-exception.filter';
import { LoggingInterceptor } from './libs/interceptor/logging.interceptor';
import { AuthGuard } from './components/auth/guards/auth.guard';
import { RolesGuard } from './components/auth/guards/roles.guard';

@Module({
	imports: [
		CacheModule.register({
			isGlobal: true,
			ttl: 300000,
			max: 200,
		}),
		ConfigModule.forRoot(),
		GraphQLModule.forRoot({
			autoSchemaFile: true,
			driver: ApolloDriver,
			playground: true,
			uploads: true,
			context: ({ req }) => ({ req }),
		}),
		ComponentsModule,
		AuthModule,
		DatabaseModule,
		SocketModule,
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
	],
})
export class AppModule {}
