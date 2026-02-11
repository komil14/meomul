import { Module } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Module({
	imports: [
		MongooseModule.forRootAsync({
			useFactory: () => ({
				uri: process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV,
			}),
		}),
	],
	exports: [MongooseModule],
})
export class DatabaseModule {
	constructor(@InjectConnection() private readonly connection: Connection) {
		if (this.connection.readyState === 1) {
			console.log(
				'Database connected successfully into ' +
					(process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT') +
					' db',
			);
		} else {
			console.error('Database connection failed');
		}
	}
}
