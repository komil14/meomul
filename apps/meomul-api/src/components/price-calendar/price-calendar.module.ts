import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../../schemas/Room.model';
import BookingSchema from '../../schemas/Booking.model';
import { PriceCalendarService } from './price-calendar.service';
import { PriceCalendarResolver } from './price-calendar.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Booking', schema: BookingSchema },
		]),
	],
	providers: [PriceCalendarService, PriceCalendarResolver],
	exports: [PriceCalendarService],
})
export class PriceCalendarModule {}
