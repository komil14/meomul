import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberDto } from '../../libs/dto/member/member';
import { MembersDto } from '../../libs/dto/common/members';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { MemberService } from './member.service';

@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async signupMember(@Args('input') input: MemberInput): Promise<AuthMemberDto> {
		try {
			console.log('Mutation signup');
			return this.memberService.signup(input);
		} catch (error) {
			console.error('Mutation signup failed', error);
			throw error;
		}
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async loginMember(@Args('input') input: LoginInput): Promise<AuthMemberDto> {
		try {
			console.log('Mutation login');
			return this.memberService.login(input);
		} catch (error) {
			console.error('Mutation login failed', error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	public async updateMember(
		@CurrentMember() currentMember: any,
		@Args('input') input: MemberUpdate,
	): Promise<MemberDto> {
		try {
			console.log('Mutation updateMember', currentMember?._id ?? 'unknown');
			return this.memberService.updateMember(currentMember, input);
		} catch (error) {
			console.error('Mutation updateMember failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async updateMemberByAdmin(@Args('input') input: MemberUpdate): Promise<MemberDto> {
		try {
			console.log('Mutation updateMemberByAdmin');
			return this.memberService.updateMemberByAdmin(input);
		} catch (error) {
			console.error('Mutation updateMemberByAdmin failed', error);
			throw error;
		}
	}

	@Query(() => MembersDto)
	@Roles(MemberType.ADMIN)
	public async getAllMembersByAdmin(@Args('input') input: PaginationInput): Promise<MembersDto> {
		try {
			console.log('Query getAllMembersByAdmin');
			return this.memberService.getAllMembersByAdmin(input);
		} catch (error) {
			console.error('Query getAllMembersByAdmin failed', error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async getMemberByAdmin(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			console.log('Query getMemberByAdmin', memberId);
			return this.memberService.getMemberByAdmin(memberId);
		} catch (error) {
			console.error('Query getMemberByAdmin failed', memberId, error);
			throw error;
		}
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async deleteMemberByAdmin(@Args('memberId') memberId: string): Promise<MemberDto> {
		try {
			console.log('Mutation deleteMemberByAdmin', memberId);
			return this.memberService.deleteMemberByAdmin(memberId);
		} catch (error) {
			console.error('Mutation deleteMemberByAdmin failed', memberId, error);
			throw error;
		}
	}

	@Query(() => MemberDto)
	public async getMember(@CurrentMember() currentMember: any): Promise<MemberDto> {
		try {
			console.log('Query getMember', currentMember?._id ?? 'unknown');
			return this.memberService.getMember(currentMember);
		} catch (error) {
			console.error('Query getMember failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => String)
	public async checkAuth(@CurrentMember() currentMember: any): Promise<string> {
		try {
			console.log('Query checkAuth', currentMember?._id ?? 'unknown');
			const memberNick = currentMember?.memberNick ?? 'unknown';
			const memberType = currentMember?.memberType ?? 'unknown';
			const memberId = currentMember?._id ?? 'unknown';
			return `Wassup ${memberNick}, you are ${memberType} and your id ( ${memberId} )`;
		} catch (error) {
			console.error('Query checkAuth failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	@Query(() => ResponseDto)
	@Roles(MemberType.ADMIN)
	public async checkAuthRoles(@CurrentMember() currentMember: any): Promise<ResponseDto> {
		try {
			console.log('Query checkAuthRoles', currentMember?._id ?? 'unknown');
			return this.memberService.checkAuthRoles(currentMember);
		} catch (error) {
			console.error('Query checkAuthRoles failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}
}
