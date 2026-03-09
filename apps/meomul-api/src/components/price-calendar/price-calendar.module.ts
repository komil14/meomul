import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../../schemas/Room.model';
import RoomInventorySchema from '../../schemas/RoomInventory.model';
import HotelSchema from '../../schemas/Hotel.model';
import { PriceCalendarService } from './price-calendar.service';
import { PriceCalendarResolver } from './price-calendar.resolver';
import { RoomInventoryModule } from '../room-inventory/room-inventory.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Room', schema: RoomSchema },
			{ name: 'RoomInventory', schema: RoomInventorySchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
		RoomInventoryModule,
	],
	providers: [PriceCalendarService, PriceCalendarResolver],
	exports: [PriceCalendarService],
})
export class PriceCalendarModule {}
