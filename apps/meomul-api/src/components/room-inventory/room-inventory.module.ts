import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomInventorySchema from '../../schemas/RoomInventory.model';
import { RoomInventoryService } from './room-inventory.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'RoomInventory', schema: RoomInventorySchema }])],
	providers: [RoomInventoryService],
	exports: [RoomInventoryService],
})
export class RoomInventoryModule {}
