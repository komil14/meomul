import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../../../meomul-api/src/schemas/Room.model';
import HotelSchema from '../../../meomul-api/src/schemas/Hotel.model';
import { DealService } from './deal.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
	],
	providers: [DealService],
})
export class DealModule {}
