import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ReviewSchema from '../../schemas/Review.model';
import BookingSchema from '../../schemas/Booking.model';
import HotelSchema from '../../schemas/Hotel.model';
import { ReviewService } from './review.service';
import { ReviewResolver } from './review.resolver';
import { AuthModule } from '../auth/auth.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
		AuthModule,
		LikeModule,
		ViewModule,
	],
	providers: [ReviewService, ReviewResolver],
	exports: [ReviewService],
})
export class ReviewModule {}
