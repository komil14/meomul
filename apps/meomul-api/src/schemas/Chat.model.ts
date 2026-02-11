import { Schema } from 'mongoose';
import { SenderType, MessageType, ChatStatus } from '../libs/enums/common.enum';

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
ChatSchema.index({ chatStatus: 1, lastMessageAt: -1 });
ChatSchema.index({ assignedAgentId: 1 });

export default ChatSchema;
