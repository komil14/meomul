import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MembersDto } from '../../libs/dto/common/members';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { SubscriptionStatusDto } from '../../libs/dto/member/subscription-status';
import { OnboardingPreferenceInput } from '../../libs/dto/preference/onboarding-preference.input';
import { MemberStatus, SubscriptionTier } from '../../libs/enums/member.enum';
import { TravelStyle, BudgetLevel } from '../../libs/enums/preference.enum';
import { StayPurpose, NotificationType } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { UserProfileDocument } from '../../libs/types/user-profile';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		@InjectModel('UserProfile') private readonly userProfileModel: Model<UserProfileDocument>,
		private readonly authService: AuthService,
		private readonly notificationService: NotificationService,
	) {}

	public async signup(input: MemberInput): Promise<AuthMemberDto> {
		const existing = await this.memberModel.findOne({
			$or: [{ memberNick: input.memberNick }, { memberPhone: input.memberPhone }],
		});
		if (existing) {
			throw new BadRequestException(Messages.USED_MEMBER_NICK_OR_PHONE);
		}

		const memberPassword = await this.authService.hashPassword(input.memberPassword);
		const createdMember = await this.memberModel.create({
			...input,
			memberPassword,
		});
		const accessToken = await this.authService.generateJwtToken(createdMember);

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_MEMBER,
				'New Member',
				`${input.memberNick} just signed up`,
				`/admin/members/${createdMember._id}`,
			)
			.catch(() => {});

		return this.toAuthMember(createdMember, accessToken);
	}

	public async login(input: LoginInput): Promise<AuthMemberDto> {
		const member = await this.memberModel.findOne({ memberNick: input.memberNick }).select('+memberPassword').exec();

		if (!member || member.memberStatus === MemberStatus.DELETE) {
			throw new UnauthorizedException(Messages.NO_MEMBER_NICK);
		}

		if (member.memberStatus === MemberStatus.BLOCK) {
			throw new UnauthorizedException(Messages.BLOCKED_USER);
		}

		if (!member.memberPassword) {
			throw new UnauthorizedException(Messages.WRONG_PASSWORD);
		}

		const isMatch = await this.authService.comparePassword(input.memberPassword, member.memberPassword);
		if (!isMatch) {
			throw new UnauthorizedException(Messages.WRONG_PASSWORD);
		}

		const accessToken = await this.authService.generateJwtToken(member);
		return this.toAuthMember(member, accessToken);
	}

	public async updateMember(currentMember: MemberJwtPayload, input: MemberUpdate): Promise<MemberDocument> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const updateData = this.buildUpdatePayload(input, false);
		return this.updateMemberById(currentMember._id, updateData);
	}

	public async updateMemberByAdmin(input: MemberUpdate): Promise<MemberDocument> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		const updateData = this.buildUpdatePayload(input, true);
		return this.updateMemberById(input._id, updateData);
	}

	public async getAllMembersByAdmin(input: PaginationInput): Promise<MembersDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const [list, total] = await Promise.all([
			this.memberModel
				.find()
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.memberModel.countDocuments().exec(),
		]);

		return {
			list,
			metaCounter: { total },
		};
	}

	public async getMemberByAdmin(memberId: string): Promise<MemberDocument> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}
		return member;
	}

	public async getMember(currentMember: MemberJwtPayload): Promise<MemberDocument> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const member = await this.memberModel.findById(currentMember._id).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		return member;
	}

	public async checkAuth(currentMember: MemberJwtPayload): Promise<MemberDocument> {
		return this.getMember(currentMember);
	}

	public async checkAuthRoles(currentMember: MemberJwtPayload): Promise<ResponseDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		return {
			success: true,
			message: 'OK',
			data: currentMember._id,
		};
	}

	public async requestSubscription(currentMember: MemberJwtPayload, requestedTier: SubscriptionTier): Promise<ResponseDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		if (requestedTier === SubscriptionTier.FREE) {
			throw new BadRequestException('Cannot request FREE tier');
		}

		const member = await this.memberModel.findById(currentMember._id).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		if (member.subscriptionTier === requestedTier) {
			throw new BadRequestException(`You are already on the ${requestedTier} tier`);
		}

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.SUBSCRIPTION_REQUEST,
				'Subscription Request',
				`${currentMember.memberNick} requested ${requestedTier} subscription`,
				`/admin/members/${currentMember._id}`,
			)
			.catch(() => {});

		return {
			success: true,
			message: 'Subscription request sent to admin',
			data: requestedTier,
		};
	}

	public async approveSubscription(memberId: string, tier: SubscriptionTier, durationDays: number): Promise<MemberDocument> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		const subscriptionExpiry = new Date(Date.now() + durationDays * 86400000);

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(
				memberId,
				{ subscriptionTier: tier, subscriptionExpiry },
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedMember) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		// Notify user (fire-and-forget)
		this.notificationService
			.createNotification({
				userId: memberId,
				type: NotificationType.SUBSCRIPTION_APPROVED,
				title: 'Subscription Activated',
				message: `Your ${tier} subscription has been activated for ${durationDays} days!`,
				link: '/profile',
			})
			.catch(() => {});

		return updatedMember;
	}

	public async denySubscription(memberId: string, reason?: string): Promise<ResponseDto> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		// Notify user (fire-and-forget)
		this.notificationService
			.createNotification({
				userId: memberId,
				type: NotificationType.SUBSCRIPTION_DENIED,
				title: 'Subscription Request Denied',
				message: reason || 'Your subscription request has been denied by admin.',
				link: '/profile',
			})
			.catch(() => {});

		return {
			success: true,
			message: 'Subscription request denied',
			data: memberId,
		};
	}

	public async cancelSubscription(memberId: string): Promise<MemberDocument> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		if (member.subscriptionTier === SubscriptionTier.FREE) {
			throw new BadRequestException('Member is already on FREE tier');
		}

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(
				memberId,
				{ subscriptionTier: SubscriptionTier.FREE, subscriptionExpiry: null },
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedMember) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		// Notify user (fire-and-forget)
		this.notificationService
			.createNotification({
				userId: memberId,
				type: NotificationType.SUBSCRIPTION_CANCELLED,
				title: 'Subscription Cancelled',
				message: 'Your subscription has been cancelled. You are now on the FREE tier.',
				link: '/profile',
			})
			.catch(() => {});

		return updatedMember;
	}

	public async getSubscriptionStatus(currentMember: MemberJwtPayload): Promise<SubscriptionStatusDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const member = await this.memberModel.findById(currentMember._id).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		const now = new Date();
		const isActive = member.subscriptionTier !== SubscriptionTier.FREE
			&& (!member.subscriptionExpiry || member.subscriptionExpiry > now);

		let daysRemaining: number | undefined;
		if (member.subscriptionExpiry && member.subscriptionExpiry > now) {
			daysRemaining = Math.ceil((member.subscriptionExpiry.getTime() - now.getTime()) / 86400000);
		}

		return {
			tier: member.subscriptionTier,
			active: isActive,
			expiresAt: member.subscriptionExpiry ?? undefined,
			daysRemaining,
		};
	}

	public async deleteMemberByAdmin(memberId: string): Promise<MemberDocument> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(
				memberId,
				{ memberStatus: MemberStatus.DELETE, deletedAt: new Date() },
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedMember) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		return updatedMember;
	}

	public async saveOnboardingPreferences(
		currentMember: MemberJwtPayload,
		input: OnboardingPreferenceInput,
	): Promise<ResponseDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const validAmenities = [
			'pool', 'spa', 'wifi', 'parking', 'breakfast', 'gym',
			'familyRoom', 'kidsFriendly', 'petFriendly', 'oceanView',
			'mountainView', 'cityView', 'airportShuttle', 'roomService',
		];
		const invalidAmenities = input.preferredAmenities.filter((a) => !validAmenities.includes(a));
		if (invalidAmenities.length > 0) {
			throw new BadRequestException(`Invalid amenities: ${invalidAmenities.join(', ')}`);
		}

		// Map TravelStyle → StayPurpose
		const purposeMap: Record<string, string> = {
			[TravelStyle.SOLO]: StayPurpose.SOLO,
			[TravelStyle.FAMILY]: StayPurpose.FAMILY,
			[TravelStyle.COUPLE]: StayPurpose.ROMANTIC,
			[TravelStyle.FRIENDS]: StayPurpose.STAYCATION,
			[TravelStyle.BUSINESS]: StayPurpose.BUSINESS,
		};
		const preferredPurposes = input.travelStyles
			.map((style) => purposeMap[style])
			.filter(Boolean);

		// Map BudgetLevel → price range
		const budgetRanges: Record<string, { min: number; max: number }> = {
			[BudgetLevel.BUDGET]: { min: 30000, max: 80000 },
			[BudgetLevel.MID]: { min: 80000, max: 150000 },
			[BudgetLevel.PREMIUM]: { min: 150000, max: 300000 },
			[BudgetLevel.LUXURY]: { min: 300000, max: 1000000 },
		};
		const priceRange = input.budgetLevel ? budgetRanges[input.budgetLevel] : undefined;

		await this.userProfileModel.updateOne(
			{ memberId: new Types.ObjectId(currentMember._id) },
			{
				$set: {
					preferredLocations: input.preferredDestinations,
					preferredTypes: [],
					preferredPurposes: preferredPurposes,
					preferredAmenities: input.preferredAmenities,
					avgPriceMin: priceRange?.min,
					avgPriceMax: priceRange?.max,
					viewedHotelIds: [],
					likedHotelIds: [],
					bookedHotelIds: [],
					source: 'onboarding',
					computedAt: new Date(),
				},
			},
			{ upsert: true },
		);

		return {
			success: true,
			message: 'Onboarding preferences saved',
		};
	}

	private buildUpdatePayload(input: MemberUpdate, isAdmin: boolean): Record<string, unknown> {
		const updateData: Record<string, unknown> = { ...input };
		delete updateData._id;

		if (!isAdmin) {
			delete updateData.memberStatus;
			delete updateData.subscriptionTier;
		}

		return updateData;
	}

	private async updateMemberById(memberId: string, updateData: Record<string, unknown>): Promise<MemberDocument> {
		if (updateData.memberNick) {
			const existing = await this.memberModel.findOne({ memberNick: updateData.memberNick });
			if (existing && String(existing._id) !== String(memberId)) {
				throw new BadRequestException(Messages.USED_MEMBER_NICK_OR_PHONE);
			}
		}

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(memberId, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedMember) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		return updatedMember;
	}

	/**
	 * Update member statistics (followers, followings, likes, etc.)
	 * @param memberId - Member ID to update
	 * @param targetKey - Stat field to update (e.g., 'memberFollowers', 'memberFollowings')
	 * @param modifier - Amount to increment (+1) or decrement (-1)
	 * @param session - Optional MongoDB session for transactions
	 */
	public async memberStatsEditor(
		memberId: string,
		targetKey: keyof Pick<
			MemberDocument,
			| 'memberFollowers'
			| 'memberFollowings'
			| 'memberLikes'
			| 'memberViews'
			| 'memberProperties'
			| 'memberArticles'
			| 'memberComments'
		>,
		modifier: number,
		session?: ClientSession,
	): Promise<void> {
		const options = session ? { session } : {};
		await this.memberModel.findByIdAndUpdate(memberId, { $inc: { [targetKey]: modifier } }, options).exec();
	}

	private toAuthMember(member: MemberDocument, accessToken: string): AuthMemberDto {
		const memberObject = typeof member.toObject === 'function' ? member.toObject() : { ...member };
		delete memberObject.memberPassword;

		return {
			...memberObject,
			accessToken,
		} as AuthMemberDto;
	}
}
