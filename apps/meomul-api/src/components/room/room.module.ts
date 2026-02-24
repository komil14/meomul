import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../../schemas/Room.model';
import HotelSchema from '../../schemas/Hotel.model';
import { RoomService } from './room.service';
import { RoomResolver } from './room.resolver';
import { AuthModule } from '../auth/auth.module';
import { RoomInventoryModule } from '../room-inventory/room-inventory.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
		AuthModule,
		RoomInventoryModule,
	],
	providers: [RoomService, RoomResolver],
	exports: [RoomService],
})
export class RoomModule {}
