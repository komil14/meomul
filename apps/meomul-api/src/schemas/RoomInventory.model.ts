import { Schema } from 'mongoose';

const RoomInventorySchema = new Schema(
	{
		roomId: {
			type: Schema.Types.ObjectId,
			ref: 'Room',
			required: true,
			index: true,
		},
		date: {
			type: Date,
			required: true,
			index: true,
		},
		total: {
			type: Number,
			required: true,
			min: 0,
		},
		booked: {
			type: Number,
			required: true,
			default: 0,
			min: 0,
		},
		closed: {
			type: Boolean,
			default: false,
		},
		basePrice: {
			type: Number,
			min: 0,
		},
		overridePrice: {
			type: Number,
			min: 0,
		},
	},
	{
		timestamps: true,
		collection: 'roominventories',
	},
);

RoomInventorySchema.index({ roomId: 1, date: 1 }, { unique: true });
RoomInventorySchema.index({ date: 1, roomId: 1 });
RoomInventorySchema.index({ roomId: 1, closed: 1, date: 1 });

export default RoomInventorySchema;
