import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberDto } from '../../libs/dto/member/member';
import { BookingGuestCandidateDto } from '../../libs/dto/member/booking-guest-candidate';
import { SubscriptionStatusDto } from '../../libs/dto/member/subscription-status';
import { MembersDto } from '../../libs/dto/common/members';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { OnboardingPreferenceInput } from '../../libs/dto/preference/onboarding-preference.input';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';
import { MemberType, SubscriptionTier } from '../../libs/enums/member.enum';
import type { MemberJwtPayload } from '../../libs/types/member';
import { MemberService } from './member.service';

const REFRESH_TOKEN_COOKIE = 'meomul_rt';
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_TOKEN_COOKIE = 'meomul_at';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes (match JWT_EXPIRES_IN default)

@Resolver()
export class MemberResolver {
	private readonly logger = new Logger(MemberResolver.name);

	constructor(private readonly memberService: MemberService) {}

	private getCookieDomain(): string | undefined {
		if (process.env.NODE_ENV !== 'production') {
			return undefined;
		}

		const frontendUrl = process.env.FRONTEND_URL?.trim();
		if (!frontendUrl) {
			return undefined;
		}

		try {
			const hostname = new URL(frontendUrl).hostname.toLowerCase();
			if (!hostname || hostname === 'localhost') {
				return undefined;
			}
			if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
				return undefined;
			}
			return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
		} catch {
			return undefined;
		}
	}

	private setRefreshTokenCookie(res: Response, refreshToken: string): void {
		const isProduction = process.env.NODE_ENV === 'production';
		const domain = this.getCookieDomain();
		res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? 'none' : 'lax',
			maxAge: REFRESH_TOKEN_MAX_AGE_MS,
			path: '/',
			...(domain ? { domain } : {}),
		});
	}

	private clearRefreshTokenCookie(res: Response): void {
		const isProduction = process.env.NODE_ENV === 'production';
		const domain = this.getCookieDomain();
		res.clearCookie(REFRESH_TOKEN_COOKIE, {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? 'none' : 'lax',
			path: '/',
			...(domain ? { domain } : {}),
		});
	}

	private setAccessTokenCookie(res: Response, accessToken: string): void {
		const isProduction = process.env.NODE_ENV === 'production';
		const domain = this.getCookieDomain();
		res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? 'none' : 'lax',
			maxAge: ACCESS_TOKEN_MAX_AGE_MS,
			path: '/',
			...(domain ? { domain } : {}),
		});
	}

	private clearAccessTokenCookie(res: Response): void {
		const isProduction = process.env.NODE_ENV === 'production';
		const domain = this.getCookieDomain();
		res.clearCookie(ACCESS_TOKEN_COOKIE, {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? 'none' : 'lax',
			path: '/',
			...(domain ? { domain } : {}),
		});
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	@Throttle({ long: { limit: 5, ttl: 60000 } })
	public async signupMember(
		@Args('input') input: MemberInput,
		@Context() ctx: { res: Response },
	): Promise<AuthMemberDto> {
		try {
			this.logger.log('Mutation signup');
			const result = await this.memberService.signup(input);
			this.setRefreshTokenCookie(ctx.res, result.refreshToken);
			this.setAccessTokenCookie(ctx.res, result.accessToken);
			return result;
		} catch (error) {
			this.logger.error('Mutation signup failed', error);
			throw error;
		}
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	@Throttle({ long: { limit: 5, ttl: 60000 } })
	public async loginMember(
		@Args('input') input: LoginInput,
		@Context() ctx: { res: Response },
	): Promise<AuthMemberDto> {
		try {
			this.logger.log('Mutation login');
			const result = await this.memberService.login(input);
			this.setRefreshTokenCookie(ctx.res, result.refreshToken);
			this.setAccessTokenCookie(ctx.res, result.accessToken);
			return result;
		} catch (error) {
			this.logger.error('Mutation login failed', error);
			throw error;
		}
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async refreshToken(@Context() ctx: { req: Request; res: Response }): Promise<AuthMemberDto> {
		try {
			const rawToken = (ctx.req.cookies as Record<string, string | undefined>)?.[REFRESH_TOKEN_COOKIE];
			if (!rawToken) {
				throw new Error('No refresh token');
			}
			this.logger.debug('Mutation refreshToken');
			const result = await this.memberService.refreshAccessToken(rawToken);
			// Rotate: set new refresh token cookie and access token cookie
			this.setRefreshTokenCookie(ctx.res, result.refreshToken);
			this.setAccessTokenCookie(ctx.res, result.accessToken);
			return result;
		} catch (error) {
			this.logger.warn('Mutation refreshToken failed', (error as Error)?.message);
			this.clearRefreshTokenCookie(ctx.res);
			this.clearAccessTokenCookie(ctx.res);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Public()
	public async logout(@Context() ctx: { req: Request; res: Response }): Promise<ResponseDto> {
		try {
			const rawToken = (ctx.req.cookies as Record<string, string | undefined>)?.[REFRESH_TOKEN_COOKIE];
			if (rawToken) {
				await this.memberService.logoutRefreshToken(rawToken);
			}
			this.clearRefreshTokenCookie(ctx.res);
			this.clearAccessTokenCookie(ctx.res);
			return { success: true, message: 'Logged out successfully' };
		} catch (error) {
			this.logger.error('Mutation logout failed', error);
			// Always clear cookies even on error
			this.clearRefreshTokenCookie(ctx.res);
			this.clearAccessTokenCookie(ctx.res);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	public async updateMember(
		@CurrentMember() currentMember: MemberJwtPayload,
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async getAllMembersByAdmin(@Args('input') input: PaginationInput): Promise<MembersDto> {
		try {
			this.logger.log('Query getAllMembersByAdmin');
			return this.memberService.getAllMembersByAdmin(input);
		} catch (error) {
			this.logger.error('Query getAllMembersByAdmin failed', error);
			throw error;
		}
	}

	@Query(() => [BookingGuestCandidateDto])
	@Roles(MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async searchMembersForBooking(
		@CurrentMember() currentMember: MemberJwtPayload,
		@Args('keyword') keyword: string,
		@Args('limit', { type: () => Int, nullable: true, defaultValue: 10 }) limit?: number,
	): Promise<BookingGuestCandidateDto[]> {
		try {
			this.logger.log('Query searchMembersForBooking', currentMember?._id ?? 'unknown');
			return this.memberService.searchMembersForBooking(currentMember, keyword, limit ?? 10);
		} catch (error) {
			this.logger.error('Query searchMembersForBooking failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
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
		@CurrentMember() currentMember: MemberJwtPayload,
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async cancelSubscription(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			this.logger.log('Mutation cancelSubscription', memberId);
			return this.memberService.cancelSubscription(memberId);
		} catch (error) {
			this.logger.error('Mutation cancelSubscription failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Roles(MemberType.USER, MemberType.AGENT)
	public async cancelMySubscription(@CurrentMember() currentMember: MemberJwtPayload): Promise<ResponseDto> {
		try {
			this.logger.log('Mutation cancelMySubscription', currentMember?._id ?? 'unknown');
			return this.memberService.cancelMySubscription(currentMember);
		} catch (error) {
			this.logger.error('Mutation cancelMySubscription failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => SubscriptionStatusDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async getSubscriptionStatus(@CurrentMember() currentMember: MemberJwtPayload): Promise<SubscriptionStatusDto> {
		try {
			this.logger.log('Query getSubscriptionStatus', currentMember?._id ?? 'unknown');
			return this.memberService.getSubscriptionStatus(currentMember);
		} catch (error) {
			this.logger.error('Query getSubscriptionStatus failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	public async getMember(@CurrentMember() currentMember: MemberJwtPayload): Promise<MemberDto> {
		try {
			this.logger.log('Query getMember', currentMember?._id ?? 'unknown');
			return this.memberService.getMember(currentMember);
		} catch (error) {
			this.logger.error('Query getMember failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => String)
	public checkAuth(@CurrentMember() currentMember: MemberJwtPayload): string {
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
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public checkAuthRoles(@CurrentMember() currentMember: MemberJwtPayload): ResponseDto {
		try {
			this.logger.log('Query checkAuthRoles', currentMember?._id ?? 'unknown');
			return this.memberService.checkAuthRoles(currentMember);
		} catch (error) {
			this.logger.error('Query checkAuthRoles failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Mutation(() => ResponseDto)
	@Roles(MemberType.USER)
	public async saveOnboardingPreferences(
		@CurrentMember() currentMember: MemberJwtPayload,
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
