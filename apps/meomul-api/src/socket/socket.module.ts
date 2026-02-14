import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../schemas/Room.model';
import { RoomViewersGateway } from './room-viewers.gateway';
import { NotificationGateway } from './notification.gateway';
import { ChatGateway } from './chat.gateway';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Room', schema: RoomSchema }]),
	],
	providers: [RoomViewersGateway, NotificationGateway, ChatGateway],
	exports: [RoomViewersGateway, NotificationGateway, ChatGateway],
})
export class SocketModule {}
