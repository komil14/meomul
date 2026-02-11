import { Schema } from 'mongoose';
import { ReviewStatus } from '../libs/enums/common.enum';

const ReviewSchema = new Schema(
	{
		reviewerId: {
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
		bookingId: {
			type: Schema.Types.ObjectId,
			ref: 'Booking',
			required: true,
			unique: true, // One review per booking
		},

		verifiedStay: {
			type: Boolean,
			default: true,
		},
		stayDate: {
			type: Date,
			required: true,
		},

		overallRating: {
			type: Number,
			required: true,
			min: 1,
			max: 5,
		},
		cleanlinessRating: {
			type: Number,
			min: 1,
			max: 5,
			required: true,
		},
		locationRating: {
			type: Number,
			min: 1,
			max: 5,
			required: true,
		},
		valueRating: {
			type: Number,
			min: 1,
			max: 5,
			required: true,
		},
		serviceRating: {
			type: Number,
			min: 1,
			max: 5,
			required: true,
		},
		amenitiesRating: {
			type: Number,
			min: 1,
			max: 5,
			required: true,
		},

		reviewTitle: String,
		reviewText: {
			type: String,
			required: true,
		},

		guestPhotos: {
			type: [String],
			default: [],
		},

		helpfulCount: {
			type: Number,
			default: 0,
		},

		hotelResponse: {
			responseText: String,
			respondedBy: Schema.Types.ObjectId,
			respondedAt: Date,
		},

		reviewStatus: {
			type: String,
			enum: Object.values(ReviewStatus),
			default: ReviewStatus.APPROVED,
		},
	},
	{
		timestamps: true,
		collection: 'reviews',
	},
);

// Indexes
ReviewSchema.index({ hotelId: 1, reviewStatus: 1, createdAt: -1 });
ReviewSchema.index({ bookingId: 1 }, { unique: true });

export default ReviewSchema;
