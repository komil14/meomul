import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../../meomul-api/src/schemas/Booking.model';
import RoomSchema from '../../../meomul-api/src/schemas/Room.model';
import NotificationSchema from '../../../meomul-api/src/schemas/Notification.model';
import { BookingService } from './booking.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Notification', schema: NotificationSchema },
		]),
	],
	providers: [BookingService],
})
export class BookingModule {}
