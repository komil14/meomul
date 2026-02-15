import { Schema } from 'mongoose';

const UserProfileSchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			unique: true,
			index: true,
		},
		preferredLocations: { type: [String], default: [] },
		preferredTypes: { type: [String], default: [] },
		preferredPurposes: { type: [String], default: [] },
		preferredAmenities: { type: [String], default: [] },
		avgPriceMin: Number,
		avgPriceMax: Number,
		viewedHotelIds: [{ type: Schema.Types.ObjectId }],
		likedHotelIds: [{ type: Schema.Types.ObjectId }],
		bookedHotelIds: [{ type: Schema.Types.ObjectId }],
		computedAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
	},
	{
		timestamps: true,
		collection: 'userprofiles',
	},
);

export default UserProfileSchema;
