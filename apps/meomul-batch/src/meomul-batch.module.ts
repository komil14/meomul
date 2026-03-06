import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import type { Connection } from 'mongoose';
import { MeomulBatchController } from './meomul-batch.controller';
import { MeomulBatchService } from './meomul-batch.service';
import { DealModule } from './deal/deal.module';
import { BookingModule } from './booking/booking.module';
import { RankingModule } from './ranking/ranking.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { ChatModule } from './chat/chat.module';
import { PriceLockModule } from './price-lock/price-lock.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { CommonModule } from './common/common.module';
import { attachMongoSlowQueryMonitor } from '../../meomul-api/src/database/mongo-monitor';

@Module({
	imports: [
		ConfigModule.forRoot(),
		MongooseModule.forRootAsync({
			useFactory: () => ({
				uri: process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV,
				maxIdleTimeMS: 25000,
				connectTimeoutMS: 30000,
				socketTimeoutMS: 45000,
				serverSelectionTimeoutMS: 30000,
				// Batch worker needs fewer connections than the API
				maxPoolSize: process.env.NODE_ENV === 'production' ? 20 : 10,
				minPoolSize: 1,
				monitorCommands: process.env.MONGO_SLOW_QUERY_LOG === 'true',
				autoIndex: process.env.NODE_ENV !== 'production',
				connectionFactory: (connection: Connection) => {
					attachMongoSlowQueryMonitor(connection, 'batch');
					return connection;
				},
			}),
		}),
		ScheduleModule.forRoot(),
		CommonModule,
		DealModule,
		BookingModule,
		RankingModule,
		CleanupModule,
		ChatModule,
		PriceLockModule,
		SubscriptionModule,
		RecommendationModule,
	],
	controllers: [MeomulBatchController],
	providers: [MeomulBatchService],
})
export class MeomulBatchModule {}
