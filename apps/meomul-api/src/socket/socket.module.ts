import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import RoomSchema from '../schemas/Room.model';
import ChatSchema from '../schemas/Chat.model';
import HotelSchema from '../schemas/Hotel.model';
import { RoomViewersGateway } from './room-viewers.gateway';
import { NotificationGateway } from './notification.gateway';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../components/auth/auth.module';

@Module({
	imports: [
		AuthModule,
		MongooseModule.forFeature([
			{ name: 'Room', schema: RoomSchema },
			{ name: 'Chat', schema: ChatSchema },
			{ name: 'Hotel', schema: HotelSchema },
		]),
	],
	providers: [RoomViewersGateway, NotificationGateway, ChatGateway],
	exports: [RoomViewersGateway, NotificationGateway, ChatGateway],
})
export class SocketModule {}
