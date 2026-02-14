import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import HotelSchema from '../../schemas/Hotel.model';
import RoomSchema from '../../schemas/Room.model';
import BookingSchema from '../../schemas/Booking.model';
import ReviewSchema from '../../schemas/Review.model';
import ChatSchema from '../../schemas/Chat.model';
import { StatsService } from './stats.service';
import { StatsResolver } from './stats.resolver';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Chat', schema: ChatSchema },
		]),
		AuthModule,
	],
	providers: [StatsService, StatsResolver],
	exports: [StatsService],
})
export class StatsModule {}
