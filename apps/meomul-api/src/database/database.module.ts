import { Logger, Module } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { attachMongoSlowQueryMonitor } from './mongo-monitor';

@Module({
	imports: [
		MongooseModule.forRootAsync({
			useFactory: () => ({
				uri: process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV,
				// Close idle connections after 25s — Atlas drops them at ~30s on shared tier,
				// so we clean up proactively to avoid PoolClearedOnNetworkError
				maxIdleTimeMS: 25000,
				// How long a connection attempt can take
				connectTimeoutMS: 30000,
				// How long a socket read/write can be silent before timing out
				socketTimeoutMS: 45000,
				// How long the driver waits to find an available server
				serverSelectionTimeoutMS: 30000,
				// Keep the connection pool small — scheduler jobs are infrequent
				maxPoolSize: 10,
				minPoolSize: 1,
				monitorCommands: process.env.MONGO_SLOW_QUERY_LOG === 'true',
			}),
		}),
	],
	exports: [MongooseModule],
})
export class DatabaseModule {
	private readonly logger = new Logger(DatabaseModule.name);

	constructor(@InjectConnection() private readonly connection: Connection) {
		attachMongoSlowQueryMonitor(this.connection, 'api');

		if (this.connection.readyState === ConnectionStates.connected) {
			this.logger.log(
				'Database connected successfully into ' +
					(process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT') +
					' db',
			);
		} else {
			this.logger.error('Database connection failed');
		}
	}
}
