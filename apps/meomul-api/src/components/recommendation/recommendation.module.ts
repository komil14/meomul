import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../schemas/Hotel.model';
import ViewSchema from '../../schemas/View.model';
import LikeSchema from '../../schemas/Like.model';
import BookingSchema from '../../schemas/Booking.model';
import SearchHistorySchema from '../../schemas/SearchHistory.model';
import RecommendationCacheSchema from '../../schemas/RecommendationCache.model';
import { RecommendationService } from './recommendation.service';
import { RecommendationResolver } from './recommendation.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'SearchHistory', schema: SearchHistorySchema },
			{ name: 'RecommendationCache', schema: RecommendationCacheSchema },
		]),
	],
	providers: [RecommendationService, RecommendationResolver],
})
export class RecommendationModule {}
