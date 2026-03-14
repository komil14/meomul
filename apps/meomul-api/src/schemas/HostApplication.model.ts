import { Schema } from 'mongoose';
import { HotelLocation, HotelType } from '../libs/enums/hotel.enum';
import { StayPurpose } from '../libs/enums/common.enum';
import { HostApplicationStatus } from '../libs/enums/member.enum';

const HostApplicationSchema = new Schema(
	{
		applicantMemberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		businessName: {
			type: String,
			required: true,
			trim: true,
			maxlength: 80,
		},
		businessDescription: {
			type: String,
			required: true,
			trim: true,
			maxlength: 1200,
		},
		contactPhone: {
			type: String,
			trim: true,
			maxlength: 20,
		},
		businessEmail: {
			type: String,
			trim: true,
			maxlength: 120,
		},
		intendedHotelName: {
			type: String,
			trim: true,
			maxlength: 120,
		},
		intendedHotelLocation: {
			type: String,
			enum: Object.values(HotelLocation),
		},
		hotelType: {
			type: String,
			enum: Object.values(HotelType),
			required: true,
			default: HotelType.HOTEL,
		},
		suitableFor: {
			type: [String],
			enum: Object.values(StayPurpose),
			default: [],
		},
		notes: {
			type: String,
			trim: true,
			maxlength: 1000,
		},
		status: {
			type: String,
			enum: Object.values(HostApplicationStatus),
			default: HostApplicationStatus.PENDING,
			index: true,
		},
		reviewedByMemberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},
		reviewNote: {
			type: String,
			trim: true,
			maxlength: 1000,
		},
		reviewedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
		collection: 'host_applications',
	},
);

HostApplicationSchema.index({ applicantMemberId: 1, status: 1, createdAt: -1 });
HostApplicationSchema.index({ status: 1, createdAt: -1 });

export default HostApplicationSchema;
