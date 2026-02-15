import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../../meomul-api/src/schemas/Hotel.model';
import ViewSchema from '../../../meomul-api/src/schemas/View.model';
import LikeSchema from '../../../meomul-api/src/schemas/Like.model';
import BookingSchema from '../../../meomul-api/src/schemas/Booking.model';
import RecommendationCacheSchema from '../../../meomul-api/src/schemas/RecommendationCache.model';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'RecommendationCache', schema: RecommendationCacheSchema },
		]),
	],
	providers: [RecommendationService],
})
export class RecommendationModule {}
