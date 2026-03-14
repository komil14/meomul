import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { ResetPasswordInput } from '../../libs/dto/auth/reset-password.input';
import { HostApplicationDto } from '../../libs/dto/member/host-application';
import { HostApplicationInput } from '../../libs/dto/member/host-application.input';
import { HostApplicationReviewInput } from '../../libs/dto/member/host-application-review.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MembersDto } from '../../libs/dto/common/members';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { SubscriptionStatusDto } from '../../libs/dto/member/subscription-status';
import { BookingGuestCandidateDto } from '../../libs/dto/member/booking-guest-candidate';
import { OnboardingPreferenceInput } from '../../libs/dto/preference/onboarding-preference.input';
import {
	HostAccessStatus,
	HostApplicationStatus,
	MemberStatus,
	MemberType,
	SubscriptionTier,
} from '../../libs/enums/member.enum';
import { TravelStyle, BudgetLevel } from '../../libs/enums/preference.enum';
import { StayPurpose, NotificationType } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { HostApplicationDocument } from '../../libs/types/host-application';
import { toHostApplicationDto } from '../../libs/types/host-application';
import type { UserProfileDocument } from '../../libs/types/user-profile';
import { assertApprovedHostAccess } from '../../libs/utils/member-access';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notification/notification.service';
import { RecommendationService } from '../recommendation/recommendation.service';

const ONBOARDING_AMENITY_KEYS = [
	'workspace',
	'wifi',
	'meetingRoom',
	'coupleRoom',
	'romanticView',
	'privateBath',
	'familyRoom',
	'kidsFriendly',
	'playground',
	'pool',
	'spa',
	'roomService',
	'restaurant',
	'parking',
	'breakfast',
	'breakfastIncluded',
	'gym',
	'airportShuttle',
	'evCharging',
	'wheelchairAccessible',
	'elevator',
	'accessibleBathroom',
	'visualAlarms',
	'serviceAnimalsAllowed',
] as const;

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		@InjectModel('UserProfile') private readonly userProfileModel: Model<UserProfileDocument>,
		@InjectModel('HostApplication') private readonly hostApplicationModel: Model<HostApplicationDocument>,
		private readonly authService: AuthService,
		private readonly notificationService: NotificationService,
		private readonly recommendationService: RecommendationService,
	) {}

	public async signup(input: MemberInput): Promise<AuthMemberDto & { refreshToken: string }> {
		if (input.memberType !== MemberType.USER && input.memberType !== MemberType.AGENT) {
			throw new BadRequestException('Public signup can only create USER or pending AGENT accounts');
		}

		const existing = await this.memberModel.findOne({
			$or: [{ memberNick: input.memberNick }, { memberPhone: input.memberPhone }],
		});
		if (existing) {
			throw new BadRequestException(Messages.USED_MEMBER_NICK_OR_PHONE);
		}

		const memberPassword = await this.authService.hashPassword(input.memberPassword);
		const isHostSignup = input.memberType === MemberType.AGENT;
		const createdMember = await this.memberModel.create({
			...input,
			memberType: isHostSignup ? MemberType.AGENT : MemberType.USER,
			hostAccessStatus: HostAccessStatus.NONE,
			memberPassword,
		});
		const [accessToken, refreshToken] = await Promise.all([
			this.authService.generateJwtToken(createdMember),
			this.authService.createRefreshToken(createdMember._id.toString()),
		]);

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_MEMBER,
				isHostSignup ? 'New Agent Signup' : 'New Member',
				isHostSignup
					? `${input.memberNick} signed up directly into agent access and still needs host application review`
					: `${input.memberNick} just signed up`,
				`/admin/members/${createdMember._id.toString()}`,
			)
			.catch(() => {});

		return { ...this.toAuthMember(createdMember, accessToken), refreshToken };
	}

	public async requestHostApplication(
		currentMember: MemberJwtPayload,
		input: HostApplicationInput,
	): Promise<HostApplicationDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const member = await this.memberModel.findById(currentMember._id).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		if (member.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}

		if (member.memberType !== MemberType.AGENT) {
			throw new BadRequestException('Only AGENT accounts can request host access');
		}
		if (member.hostAccessStatus === HostAccessStatus.APPROVED) {
			throw new BadRequestException('Host access is already approved for this account');
		}

		const pendingApplication = await this.hostApplicationModel
			.findOne({
				applicantMemberId: currentMember._id,
				status: HostApplicationStatus.PENDING,
			})
			.sort({ createdAt: -1 })
			.exec();

		if (pendingApplication) {
			throw new BadRequestException('You already have a pending host application');
		}

		const application = await this.hostApplicationModel.create({
			applicantMemberId: currentMember._id,
			businessName: input.businessName.trim(),
			businessDescription: input.businessDescription.trim(),
			contactPhone: input.contactPhone?.trim(),
			businessEmail: input.businessEmail?.trim(),
			intendedHotelName: input.intendedHotelName?.trim(),
			intendedHotelLocation: input.intendedHotelLocation,
			hotelType: input.hotelType,
			suitableFor: input.suitableFor ?? [],
			notes: input.notes?.trim(),
			status: HostApplicationStatus.PENDING,
		});

		await this.memberModel
			.findByIdAndUpdate(currentMember._id, {
				memberType: MemberType.AGENT,
				hostAccessStatus: HostAccessStatus.PENDING,
			})
			.exec();

		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_MEMBER,
				'New Host Application',
				`${currentMember.memberNick} requested host access`,
				`/admin/host-applications`,
			)
			.catch(() => {});

		return this.toHostApplicationDtoWithMembers(application);
	}

	public async getMyHostApplication(currentMember: MemberJwtPayload): Promise<HostApplicationDto | null> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const application = await this.hostApplicationModel
			.findOne({ applicantMemberId: currentMember._id })
			.sort({ createdAt: -1 })
			.exec();

		return application ? this.toHostApplicationDtoWithMembers(application) : null;
	}

	public async getHostApplicationsByAdmin(statusFilter?: HostApplicationStatus): Promise<HostApplicationDto[]> {
		const list = await this.hostApplicationModel
			.find(statusFilter ? { status: statusFilter } : {})
			.sort({ createdAt: -1 })
			.exec();

		return this.toHostApplicationDtosWithMembers(list);
	}

	public async reviewHostApplication(
		currentMember: MemberJwtPayload,
		input: HostApplicationReviewInput,
	): Promise<HostApplicationDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		if (
			input.status !== HostApplicationStatus.APPROVED &&
			input.status !== HostApplicationStatus.REJECTED
		) {
			throw new BadRequestException('Host application review must be APPROVED or REJECTED');
		}

		const application = await this.hostApplicationModel.findById(input.applicationId).exec();
		if (!application) {
			throw new BadRequestException(Messages.NO_DATA_FOUND);
		}

		if (application.status !== HostApplicationStatus.PENDING) {
			throw new BadRequestException('Only pending host applications can be reviewed');
		}

		application.status = input.status;
		application.reviewNote = input.reviewNote?.trim();
		application.reviewedByMemberId = new Types.ObjectId(currentMember._id);
		application.reviewedAt = new Date();
		await application.save();

		if (input.status === HostApplicationStatus.APPROVED) {
			await this.memberModel
				.findByIdAndUpdate(application.applicantMemberId, {
					memberType: MemberType.AGENT,
					hostAccessStatus: HostAccessStatus.APPROVED,
				})
				.exec();

			this.notificationService
				.createAndPush(
					{
						userId: application.applicantMemberId.toString(),
						type: NotificationType.NEW_MEMBER,
						title: 'Host access approved',
						message: 'Your pending agent access is now approved. You can create hotels.',
						link: '/hotels/create',
					},
					'SYSTEM',
				)
				.catch(() => {});
		} else {
			await this.memberModel
				.findByIdAndUpdate(application.applicantMemberId, {
					memberType: MemberType.AGENT,
					hostAccessStatus: HostAccessStatus.REJECTED,
				})
				.exec();
			this.notificationService
				.createAndPush(
					{
						userId: application.applicantMemberId.toString(),
						type: NotificationType.NEW_MEMBER,
						title: 'Host access update',
						message: 'Your pending agent access was not approved.',
						link: '/host/apply',
					},
					'SYSTEM',
				)
				.catch(() => {});
		}

		return this.toHostApplicationDtoWithMembers(application);
	}

	public async login(input: LoginInput): Promise<AuthMemberDto & { refreshToken: string }> {
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

		const [accessToken, refreshToken] = await Promise.all([
			this.authService.generateJwtToken(member),
			this.authService.createRefreshToken(member._id.toString()),
		]);
		return { ...this.toAuthMember(member, accessToken), refreshToken };
	}

	public async resetPassword(input: ResetPasswordInput): Promise<ResponseDto> {
		const member = await this.memberModel
			.findOne({
				memberNick: input.memberNick.trim(),
				memberPhone: input.memberPhone.trim(),
			})
			.select('+memberPassword')
			.exec();

		if (!member || member.memberStatus === MemberStatus.DELETE) {
			throw new BadRequestException(Messages.INVALID_MEMBER_RECOVERY);
		}

		if (member.memberStatus === MemberStatus.BLOCK) {
			throw new UnauthorizedException(Messages.BLOCKED_USER);
		}

		member.memberPassword = await this.authService.hashPassword(input.newPassword);
		await member.save();
		await this.authService.revokeAllMemberTokens(member._id.toString());

		return {
			success: true,
			message: 'Password updated successfully. Please log in again.',
		};
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

		const [list, total, userCount, agentCount, adminCount, operatorCount] = await Promise.all([
			this.memberModel
				.find()
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.memberModel.countDocuments().exec(),
			this.memberModel.countDocuments({ memberType: MemberType.USER }).exec(),
			this.memberModel.countDocuments({ memberType: MemberType.AGENT }).exec(),
			this.memberModel.countDocuments({ memberType: MemberType.ADMIN }).exec(),
			this.memberModel.countDocuments({ memberType: MemberType.ADMIN_OPERATOR }).exec(),
		]);

		return {
			list,
			metaCounter: { total },
			typeCounts: {
				USER: userCount,
				AGENT: agentCount,
				ADMIN: adminCount,
				ADMIN_OPERATOR: operatorCount,
			},
		};
	}

	public async searchMembersForBooking(
		currentMember: MemberJwtPayload,
		keyword: string,
		limit = 10,
	): Promise<BookingGuestCandidateDto[]> {
		const isStaffCreator =
			currentMember.memberType === MemberType.AGENT ||
			currentMember.memberType === MemberType.ADMIN ||
			currentMember.memberType === MemberType.ADMIN_OPERATOR;
		if (!isStaffCreator) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
		if (currentMember.memberType === MemberType.AGENT) {
			assertApprovedHostAccess(currentMember);
		}

		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const trimmedKeyword = keyword.trim();
		if (trimmedKeyword.length < 2) {
			return [];
		}

		const safeLimit = Math.min(Math.max(limit, 1), 20);
		const escapedKeyword = this.escapeRegExp(trimmedKeyword);
		const regex = new RegExp(escapedKeyword, 'i');

		const members = await this.memberModel
			.find({
				memberType: MemberType.USER,
				memberStatus: MemberStatus.ACTIVE,
				$or: [{ memberNick: regex }, { memberFullName: regex }, { memberPhone: regex }],
			})
			.select('_id memberNick memberFullName memberPhone')
			.sort({ createdAt: -1 })
			.limit(safeLimit)
			.exec();

		return members.map((member) => ({
			_id: member._id as unknown as BookingGuestCandidateDto['_id'],
			memberNick: member.memberNick,
			memberFullName: member.memberFullName,
			memberPhone: member.memberPhone,
		}));
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

	public checkAuthRoles(currentMember: MemberJwtPayload): ResponseDto {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		return {
			success: true,
			message: 'OK',
			data: currentMember._id,
		};
	}

	public async requestSubscription(
		currentMember: MemberJwtPayload,
		requestedTier: SubscriptionTier,
	): Promise<ResponseDto> {
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

		// Check for existing pending request
		const hasPending = await this.notificationService.hasPendingSubscriptionRequest(String(currentMember._id));
		if (hasPending) {
			throw new BadRequestException('You already have a pending subscription request. Please wait for admin review.');
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

	public async approveSubscription(
		memberId: string,
		tier: SubscriptionTier,
		durationDays: number,
	): Promise<MemberDocument> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		const subscriptionExpiry = new Date(Date.now() + durationDays * 86400000);

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(memberId, { subscriptionTier: tier, subscriptionExpiry }, { returnDocument: 'after' })
			.exec();

		if (!updatedMember) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		// Notify user (fire-and-forget — DB + real-time push)
		this.notificationService
			.createAndPush(
				{
					userId: memberId,
					type: NotificationType.SUBSCRIPTION_APPROVED,
					title: 'Subscription Activated',
					message: `Your ${tier} subscription has been activated for ${durationDays} days!`,
					link: '/profile',
				},
				'SYSTEM',
			)
			.catch(() => {});

		// Remove processed subscription request notifications
		await this.notificationService.deleteSubscriptionRequestsForMember(memberId);

		return updatedMember;
	}

	public async denySubscription(memberId: string, reason?: string): Promise<ResponseDto> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		// Notify user (fire-and-forget — DB + real-time push)
		this.notificationService
			.createAndPush(
				{
					userId: memberId,
					type: NotificationType.SUBSCRIPTION_DENIED,
					title: 'Subscription Request Denied',
					message: reason || 'Your subscription request has been denied by admin.',
					link: '/profile',
				},
				'SYSTEM',
			)
			.catch(() => {});

		// Remove processed subscription request notifications
		await this.notificationService.deleteSubscriptionRequestsForMember(memberId);

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

		// Notify user (fire-and-forget — DB + real-time push)
		this.notificationService
			.createAndPush(
				{
					userId: memberId,
					type: NotificationType.SUBSCRIPTION_CANCELLED,
					title: 'Subscription Cancelled',
					message: 'Your subscription has been cancelled. You are now on the FREE tier.',
					link: '/profile',
				},
				'SYSTEM',
			)
			.catch(() => {});

		return updatedMember;
	}

	public async cancelMySubscription(currentMember: MemberJwtPayload): Promise<ResponseDto> {
		if (!currentMember?._id) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const member = await this.memberModel.findById(currentMember._id).exec();
		if (!member) {
			throw new BadRequestException(Messages.NO_MEMBER_NICK);
		}

		if (member.subscriptionTier === SubscriptionTier.FREE) {
			throw new BadRequestException('You are already on the FREE tier');
		}

		await this.memberModel
			.findByIdAndUpdate(currentMember._id, {
				subscriptionTier: SubscriptionTier.FREE,
				subscriptionExpiry: null,
			})
			.exec();

		return { success: true, message: 'Subscription cancelled successfully' };
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
		const isActive =
			member.subscriptionTier !== SubscriptionTier.FREE &&
			(!member.subscriptionExpiry || member.subscriptionExpiry > now);

		let daysRemaining: number | undefined;
		if (member.subscriptionExpiry && member.subscriptionExpiry > now) {
			daysRemaining = Math.ceil((member.subscriptionExpiry.getTime() - now.getTime()) / 86400000);
		}

		return {
			tier: member.subscriptionTier,
			active: isActive,
			expiresAt: member.subscriptionExpiry ?? undefined,
			daysRemaining,
			pendingRequestedTier:
				(await this.notificationService.getPendingSubscriptionTier(String(currentMember._id))) ?? undefined,
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
		if (currentMember.memberType !== MemberType.USER) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const travelStyles = Array.from(new Set(input.travelStyles));
		if (travelStyles.length === 0) {
			throw new BadRequestException('Select at least 1 travel style');
		}

		const preferredDestinations = Array.from(new Set(input.preferredDestinations));
		if (preferredDestinations.length === 0) {
			throw new BadRequestException('Select at least 1 preferred destination');
		}

		const preferredAmenities = Array.from(new Set(input.preferredAmenities));
		if (preferredAmenities.length > 5) {
			throw new BadRequestException('You can select up to 5 amenities');
		}

		const validAmenities = new Set<string>(ONBOARDING_AMENITY_KEYS);
		const invalidAmenities = preferredAmenities.filter((a) => !validAmenities.has(a));
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
		const preferredPurposes = travelStyles.map((style) => purposeMap[style]).filter(Boolean);

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
					preferredLocations: preferredDestinations,
					preferredTypes: [],
					preferredPurposes: preferredPurposes,
					preferredAmenities: preferredAmenities,
					avgPriceMin: priceRange?.min,
					avgPriceMax: priceRange?.max,
					source: 'onboarding',
					computedAt: new Date(),
				},
			},
			{ upsert: true },
		);
		await this.recommendationService.invalidateUserCache(currentMember._id);

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

	// ── Refresh token operations ────────────────────────────────────────

	private readonly refreshLogger = new Logger('RefreshToken');

	/**
	 * Validate the refresh token, look up the member, and issue a new access token.
	 * Returns { accessToken, refreshToken (new, rotated) } or throws.
	 */
	public async refreshAccessToken(rawRefreshToken: string): Promise<AuthMemberDto & { refreshToken: string }> {
		const memberId = await this.authService.validateRefreshToken(rawRefreshToken);
		if (!memberId) {
			throw new UnauthorizedException('Invalid or expired refresh token');
		}

		const member = await this.memberModel.findById(memberId).exec();
		if (!member || member.memberStatus === MemberStatus.DELETE || member.memberStatus === MemberStatus.BLOCK) {
			// Revoke all tokens for this member if they're blocked/deleted
			await this.authService.revokeAllMemberTokens(memberId);
			throw new UnauthorizedException('Account not available');
		}

		// Rotate: revoke old refresh token and issue a new one
		await this.authService.revokeRefreshToken(rawRefreshToken);
		const [accessToken, newRefreshToken] = await Promise.all([
			this.authService.generateJwtToken(member),
			this.authService.createRefreshToken(memberId),
		]);

		this.refreshLogger.debug(`Token refreshed for member ${memberId}`);
		return { ...this.toAuthMember(member, accessToken), refreshToken: newRefreshToken };
	}

	/**
	 * Revoke a specific refresh token (logout from one device).
	 */
	public async logoutRefreshToken(rawRefreshToken: string): Promise<void> {
		await this.authService.revokeRefreshToken(rawRefreshToken);
	}

	private toAuthMember(member: MemberDocument, accessToken: string): AuthMemberDto {
		const memberObject = (typeof member.toObject === 'function' ? member.toObject() : { ...member }) as unknown as Omit<
			AuthMemberDto,
			'accessToken'
		> & { memberPassword?: string };
		delete memberObject.memberPassword;

		return {
			...memberObject,
			hostAccessStatus: memberObject.hostAccessStatus ?? HostAccessStatus.NONE,
			accessToken,
		};
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private async toHostApplicationDtosWithMembers(list: HostApplicationDocument[]): Promise<HostApplicationDto[]> {
		if (list.length === 0) {
			return [];
		}

		const ids = Array.from(
			new Set(
				list.flatMap((application) => [
					String(application.applicantMemberId),
					application.reviewedByMemberId ? String(application.reviewedByMemberId) : null,
				]),
			),
		).filter((id): id is string => Boolean(id));

		const members = await this.memberModel
			.find({ _id: { $in: ids } })
			.select({ _id: 1, memberNick: 1 })
			.lean<{ _id: string; memberNick?: string }[]>()
			.exec();

		const nickById = new Map(members.map((member) => [String(member._id), member.memberNick]));

		return list.map((application) => ({
			...toHostApplicationDto(application),
			applicantMemberNick: nickById.get(String(application.applicantMemberId)),
			reviewedByMemberNick: application.reviewedByMemberId
				? nickById.get(String(application.reviewedByMemberId))
				: undefined,
		}));
	}

	private async toHostApplicationDtoWithMembers(application: HostApplicationDocument): Promise<HostApplicationDto> {
		const [dto] = await this.toHostApplicationDtosWithMembers([application]);
		return dto;
	}
}
