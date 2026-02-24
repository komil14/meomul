import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../schemas/Hotel.model';
import RoomSchema from '../../schemas/Room.model';
import SearchHistorySchema from '../../schemas/SearchHistory.model';
import RoomInventorySchema from '../../schemas/RoomInventory.model';
import { HotelService } from './hotel.service';
import { HotelResolver } from './hotel.resolver';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { NotificationModule } from '../notification/notification.module';
import { RoomInventoryModule } from '../room-inventory/room-inventory.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'Room', schema: RoomSchema },
			{ name: 'SearchHistory', schema: SearchHistorySchema },
			{ name: 'RoomInventory', schema: RoomInventorySchema },
		]),
		AuthModule,
		ViewModule,
		NotificationModule,
		RoomInventoryModule,
	],
	providers: [HotelService, HotelResolver],
	exports: [HotelService],
})
export class HotelModule {}
