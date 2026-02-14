import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ChatSchema from '../../schemas/Chat.model';
import { ChatService } from './chat.service';
import { ChatResolver } from './chat.resolver';
import { AuthModule } from '../auth/auth.module';
import { SocketModule } from '../../socket/socket.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Chat', schema: ChatSchema }]), AuthModule, SocketModule],
	providers: [ChatService, ChatResolver],
	exports: [ChatService],
})
export class ChatModule {}
