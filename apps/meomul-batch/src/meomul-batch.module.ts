import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { MeomulBatchController } from './meomul-batch.controller';
import { MeomulBatchService } from './meomul-batch.service';
import { DealModule } from './deal/deal.module';
import { BookingModule } from './booking/booking.module';
import { RankingModule } from './ranking/ranking.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { ChatModule } from './chat/chat.module';
import { PriceLockModule } from './price-lock/price-lock.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
	imports: [
		ConfigModule.forRoot(),
		MongooseModule.forRootAsync({
			useFactory: () => ({
				uri: process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV,
			}),
		}),
		ScheduleModule.forRoot(),
		DealModule,
		BookingModule,
		RankingModule,
		CleanupModule,
		ChatModule,
		PriceLockModule,
		SubscriptionModule,
	],
	controllers: [MeomulBatchController],
	providers: [MeomulBatchService],
})
export class MeomulBatchModule {}
