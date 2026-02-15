import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ViewSchema from '../../../meomul-api/src/schemas/View.model';
import LikeSchema from '../../../meomul-api/src/schemas/Like.model';
import BookingSchema from '../../../meomul-api/src/schemas/Booking.model';
import HotelSchema from '../../../meomul-api/src/schemas/Hotel.model';
import SearchHistorySchema from '../../../meomul-api/src/schemas/SearchHistory.model';
import UserProfileSchema from '../../../meomul-api/src/schemas/UserProfile.model';
import RecommendationCacheSchema from '../../../meomul-api/src/schemas/RecommendationCache.model';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'View', schema: ViewSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'SearchHistory', schema: SearchHistorySchema },
			{ name: 'UserProfile', schema: UserProfileSchema },
			{ name: 'RecommendationCache', schema: RecommendationCacheSchema },
		]),
	],
	providers: [RecommendationService],
})
export class RecommendationModule {}
