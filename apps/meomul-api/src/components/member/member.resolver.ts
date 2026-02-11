import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberDto } from '../../libs/dto/member/member';
import { MembersDto } from '../../libs/dto/common/members';
import { PaginationInput } from '../../libs/dto/common/pagination';
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
		console.log('Mutation signup');
		return this.memberService.signup(input);
	}

	@Mutation(() => AuthMemberDto)
	@Public()
	public async loginMember(@Args('input') input: LoginInput): Promise<AuthMemberDto> {
		console.log('Mutation login');
		return this.memberService.login(input);
	}

	@Mutation(() => MemberDto)
	public async updateMember(
		@CurrentMember() currentMember: any,
		@Args('input') input: MemberUpdate,
	): Promise<MemberDto> {
		return this.memberService.updateMember(currentMember, input);
	}

	@Mutation(() => MemberDto)
	@Roles(MemberType.ADMIN)
	public async updateMemberByAdmin(@Args('input') input: MemberUpdate): Promise<MemberDto> {
		return this.memberService.updateMemberByAdmin(input);
	}

	@Query(() => MembersDto)
	@Roles(MemberType.ADMIN)
	public async getAllMembersByAdmin(@Args('input') input: PaginationInput): Promise<MembersDto> {
		return this.memberService.getAllMembersByAdmin(input);
	}
}
