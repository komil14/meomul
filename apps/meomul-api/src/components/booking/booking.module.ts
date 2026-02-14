import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../schemas/Booking.model';
import RoomSchema from '../../schemas/Room.model';
import HotelSchema from '../../schemas/Hotel.model';
import { BookingService } from './booking.service';
import { BookingResolver } from './booking.resolver';
import { AuthModule } from '../auth/auth.module';
import { PriceLockModule } from '../price-lock/price-lock.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
		AuthModule,
		PriceLockModule,
		NotificationModule,
	],
	providers: [BookingService, BookingResolver],
	exports: [BookingService],
})
export class BookingModule {}
