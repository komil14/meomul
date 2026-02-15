import { Schema } from 'mongoose';
import { HotelLocation, HotelType } from '../libs/enums/hotel.enum';
import { StayPurpose } from '../libs/enums/common.enum';

const SearchHistorySchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
		},
		location: {
			type: String,
			enum: Object.values(HotelLocation),
		},
		hotelTypes: {
			type: [String],
			enum: Object.values(HotelType),
			default: [],
		},
		priceMin: Number,
		priceMax: Number,
		purpose: {
			type: String,
			enum: Object.values(StayPurpose),
		},
		amenities: {
			type: [String],
			default: [],
		},
		starRatings: {
			type: [Number],
			default: [],
		},
		guestCount: Number,
		text: String,
	},
	{
		timestamps: true,
		collection: 'searchhistories',
	},
);

// Fast per-user queries
SearchHistorySchema.index({ memberId: 1, createdAt: -1 });

// Auto-cleanup: delete search history older than 90 days
SearchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export default SearchHistorySchema;
