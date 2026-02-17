import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberDto } from '../../libs/dto/member/member';
import { SubscriptionStatusDto } from '../../libs/dto/member/subscription-status';
import { MembersDto } from '../../libs/dto/common/members';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { OnboardingPreferenceInput } from '../../libs/dto/preference/onboarding-preference.input';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType, SubscriptionTier } from '../../libs/enums/member.enum';
import { MemberService } from './member.service';

@Resolver()
export class MemberResolver {
	private readonly logger = new Logger(MemberResolver.name);

	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async signupMember(@Args('input') input: MemberInput): Promise<AuthMemberDto> {
		try {
			this.logger.log('Mutation signup');
			return this.memberService.signup(input);
		} catch (error) {
			this.logger.error('Mutation signup failed', error);
			throw error;
		}
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async loginMember(@Args('input') input: LoginInput): Promise<AuthMemberDto> {
		try {
			this.logger.log('Mutation login');
			return this.memberService.login(input);
		} catch (error) {
			this.logger.error('Mutation login failed', error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	public async updateMember(
		@CurrentMember() currentMember: any,
		@Args('input') input: MemberUpdate,
	): Promise<MemberDto> {
		try {
			this.logger.log('Mutation updateMember', currentMember?._id ?? 'unknown');
			return this.memberService.updateMember(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation updateMember failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async updateMemberByAdmin(@Args('input') input: MemberUpdate): Promise<MemberDto> {
		try {
			this.logger.log('Mutation updateMemberByAdmin');
			return this.memberService.updateMemberByAdmin(input);
		} catch (error) {
			this.logger.error('Mutation updateMemberByAdmin failed', error);
			throw error;
		}
	}

	@Query(() => MembersDto)
	@Roles(MemberType.ADMIN)
	public async getAllMembersByAdmin(@Args('input') input: PaginationInput): Promise<MembersDto> {
		try {
			this.logger.log('Query getAllMembersByAdmin');
			return this.memberService.getAllMembersByAdmin(input);
		} catch (error) {
			this.logger.error('Query getAllMembersByAdmin failed', error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async getMemberByAdmin(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			this.logger.log('Query getMemberByAdmin', memberId);
			return this.memberService.getMemberByAdmin(memberId);
		} catch (error) {
			this.logger.error('Query getMemberByAdmin failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async deleteMemberByAdmin(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			this.logger.log('Mutation deleteMemberByAdmin', memberId);
			return this.memberService.deleteMemberByAdmin(memberId);
		} catch (error) {
			this.logger.error('Mutation deleteMemberByAdmin failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async requestSubscription(
		@CurrentMember() currentMember: any,
		@Args('requestedTier', { type: () => SubscriptionTier }) requestedTier: SubscriptionTier,
	): Promise<ResponseDto> {
		try {
			this.logger.log('Mutation requestSubscription', currentMember?._id ?? 'unknown', requestedTier);
			return this.memberService.requestSubscription(currentMember, requestedTier);
		} catch (error) {
			this.logger.error('Mutation requestSubscription failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async approveSubscription(
		@Args('memberId') memberId: string,
		@Args('tier', { type: () => SubscriptionTier }) tier: SubscriptionTier,
		@Args('durationDays', { type: () => Int }) durationDays: number,
	): Promise<MemberDto> {
		try {
			this.logger.log('Mutation approveSubscription', memberId, tier, durationDays);
			return this.memberService.approveSubscription(memberId, tier, durationDays);
		} catch (error) {
			this.logger.error('Mutation approveSubscription failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Roles(MemberType.ADMIN)
	public async denySubscription(
		@Args('memberId') memberId: string,
		@Args('reason', { type: () => String, nullable: true }) reason?: string,
	): Promise<ResponseDto> {
		try {
			this.logger.log('Mutation denySubscription', memberId);
			return this.memberService.denySubscription(memberId, reason);
		} catch (error) {
			this.logger.error('Mutation denySubscription failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async cancelSubscription(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			this.logger.log('Mutation cancelSubscription', memberId);
			return this.memberService.cancelSubscription(memberId);
		} catch (error) {
			this.logger.error('Mutation cancelSubscription failed', memberId, error);
			throw error;
		}
	}

	@Query(() => SubscriptionStatusDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getSubscriptionStatus(@CurrentMember() currentMember: any): Promise<SubscriptionStatusDto> {
		try {
			this.logger.log('Query getSubscriptionStatus', currentMember?._id ?? 'unknown');
			return this.memberService.getSubscriptionStatus(currentMember);
		} catch (error) {
			this.logger.error('Query getSubscriptionStatus failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	public async getMember(@CurrentMember() currentMember: any): Promise<MemberDto> {
		try {
			this.logger.log('Query getMember', currentMember?._id ?? 'unknown');
			return this.memberService.getMember(currentMember);
		} catch (error) {
			this.logger.error('Query getMember failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => String)
	public async checkAuth(@CurrentMember() currentMember: any): Promise<string> {
		try {
			this.logger.log('Query checkAuth', currentMember?._id ?? 'unknown');
			const memberNick = currentMember?.memberNick ?? 'unknown';
			const memberType = currentMember?.memberType ?? 'unknown';
			const memberId = currentMember?._id ?? 'unknown';
			return `Wassup ${memberNick}, you are ${memberType} and your id ( ${memberId} )`;
		} catch (error) {
			this.logger.error('Query checkAuth failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => ResponseDto)
	@Roles(MemberType.ADMIN)
	public async checkAuthRoles(@CurrentMember() currentMember: any): Promise<ResponseDto> {
		try {
			this.logger.log('Query checkAuthRoles', currentMember?._id ?? 'unknown');
			return this.memberService.checkAuthRoles(currentMember);
		} catch (error) {
			this.logger.error('Query checkAuthRoles failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async saveOnboardingPreferences(
		@CurrentMember() currentMember: any,
		@Args('input') input: OnboardingPreferenceInput,
	): Promise<ResponseDto> {
		try {
			this.logger.log('Mutation saveOnboardingPreferences', currentMember?._id ?? 'unknown');
			return this.memberService.saveOnboardingPreferences(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation saveOnboardingPreferences failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}
}
