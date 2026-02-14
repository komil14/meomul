import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { ChatStatus } from '../../../meomul-api/src/libs/enums/common.enum';
import type { ChatDocument } from '../../../meomul-api/src/libs/types/chat';

@Injectable()
export class ChatService {
	private readonly logger = new Logger(ChatService.name);

	constructor(@InjectModel('Chat') private readonly chatModel: Model<ChatDocument>) {}

	/**
	 * Auto-close chats that have been inactive for 7+ days.
	 * Only targets WAITING and ACTIVE chats.
	 * Runs daily at 2:00 AM.
	 */
	@Cron('0 2 * * *')
	public async autoCloseInactiveChats(): Promise<void> {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		const result = await this.chatModel
			.updateMany(
				{
					chatStatus: { $in: [ChatStatus.WAITING, ChatStatus.ACTIVE] },
					lastMessageAt: { $lt: sevenDaysAgo },
				},
				{
					$set: { chatStatus: ChatStatus.CLOSED },
				},
			)
			.exec();

		if (result.modifiedCount > 0) {
			this.logger.log(`Auto-closed ${result.modifiedCount} inactive chat(s)`);
		}
	}
}
