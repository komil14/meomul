import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ChatSchema from '../../../meomul-api/src/schemas/Chat.model';
import { ChatService } from './chat.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Chat', schema: ChatSchema }])],
	providers: [ChatService],
})
export class ChatModule {}
