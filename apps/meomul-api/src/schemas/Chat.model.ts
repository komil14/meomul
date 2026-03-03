import { Schema } from 'mongoose';
import { SenderType, MessageType, ChatStatus, ChatScope } from '../libs/enums/common.enum';

const ChatSchema = new Schema(
	{
		guestId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		hotelId: {
			type: Schema.Types.ObjectId,
			ref: 'Hotel',
			index: true,
		},
		chatScope: {
			type: String,
			enum: Object.values(ChatScope),
			default: ChatScope.HOTEL,
			required: true,
			index: true,
		},
		assignedAgentId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		bookingId: {
			type: Schema.Types.ObjectId,
			ref: 'Booking',
		},
		supportTopic: {
			type: String,
		},
		sourcePath: {
			type: String,
		},

		messages: [
			{
				senderId: {
					type: Schema.Types.ObjectId,
					required: true,
				},
				senderType: {
					type: String,
					enum: Object.values(SenderType),
					required: true,
				},
				messageType: {
					type: String,
					enum: Object.values(MessageType),
					default: MessageType.TEXT,
				},
				content: String,
				imageUrl: String,
				fileUrl: String,
				timestamp: {
					type: Date,
					default: Date.now,
				},
				read: {
					type: Boolean,
					default: false,
				},
			},
		],

		chatStatus: {
			type: String,
			enum: Object.values(ChatStatus),
			default: ChatStatus.WAITING,
			index: true,
		},

		unreadGuestMessages: {
			type: Number,
			default: 0,
		},
		unreadAgentMessages: {
			type: Number,
			default: 0,
		},

		lastMessageAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
		collection: 'chats',
	},
);

// Indexes
ChatSchema.index({ guestId: 1, hotelId: 1 });
ChatSchema.index({ guestId: 1, lastMessageAt: -1 });
ChatSchema.index({ hotelId: 1, chatStatus: 1, lastMessageAt: -1 });
ChatSchema.index({ chatStatus: 1, lastMessageAt: -1 });
ChatSchema.index({ assignedAgentId: 1 });
ChatSchema.index({ assignedAgentId: 1, chatStatus: 1, lastMessageAt: -1 });
ChatSchema.index({ chatScope: 1, chatStatus: 1, lastMessageAt: -1 });

export default ChatSchema;
