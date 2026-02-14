import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../schemas/Hotel.model';
import RoomSchema from '../../schemas/Room.model';
import BookingSchema from '../../schemas/Booking.model';
import { HotelService } from './hotel.service';
import { HotelResolver } from './hotel.resolver';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Booking', schema: BookingSchema },
		]),
		AuthModule,
		ViewModule,
	],
	providers: [HotelService, HotelResolver],
	exports: [HotelService],
})
export class HotelModule {}
