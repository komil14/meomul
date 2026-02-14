import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../../../meomul-api/src/schemas/Room.model';
import { DealService } from './deal.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Room', schema: RoomSchema }])],
	providers: [DealService],
})
export class DealModule {}
