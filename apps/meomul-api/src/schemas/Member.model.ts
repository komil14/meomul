import { Schema } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType, SubscriptionTier } from '../libs/enums/member.enum';

const MemberSchema = new Schema(
	{
		memberType: {
			type: String,
			enum: Object.values(MemberType),
			default: MemberType.USER,
			required: true,
		},
		memberStatus: {
			type: String,
			enum: Object.values(MemberStatus),
			default: MemberStatus.ACTIVE,
			required: true,
		},
		memberAuthType: {
			type: String,
			enum: Object.values(MemberAuthType),
			default: MemberAuthType.PHONE,
			required: true,
		},
		memberPhone: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		memberNick: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		memberPassword: {
			type: String,
			required: true,
			select: false, // Don't return password by default
		},
		memberFullName: {
			type: String,
			default: '',
		},
		memberImage: {
			type: String,
			default: '/uploads/default-avatar.png',
		},
		memberAddress: {
			type: String,
			default: '',
		},
		memberDesc: {
			type: String,
			default: '',
		},

		// Subscription
		subscriptionTier: {
			type: String,
			enum: Object.values(SubscriptionTier),
			default: SubscriptionTier.FREE,
		},
		subscriptionExpiry: {
			type: Date,
			default: null,
		},

		// Points & Gamification
		memberPoints: {
			type: Number,
			default: 0,
		},
		memberBadges: {
			type: [String],
			default: [],
		},

		// Statistics
		memberProperties: {
			type: Number,
			default: 0,
		},
		memberArticles: {
			type: Number,
			default: 0,
		},
		memberFollowers: {
			type: Number,
			default: 0,
		},
		memberFollowings: {
			type: Number,
			default: 0,
		},
		memberViews: {
			type: Number,
			default: 0,
		},
		memberLikes: {
			type: Number,
			default: 0,
		},
		memberComments: {
			type: Number,
			default: 0,
		},
		memberRank: {
			type: Number,
			default: 0,
			index: true,
		},

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'members',
	},
);

// Indexes
MemberSchema.index({ memberType: 1, memberStatus: 1 });
MemberSchema.index({ memberRank: -1 });

export default MemberSchema;
