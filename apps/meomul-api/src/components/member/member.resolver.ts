import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberService } from './member.service';

@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => AuthMemberDto)
	public async signupMember(@Args('input') input: MemberInput): Promise<AuthMemberDto> {
		return this.memberService.signup(input);
	}

	@Mutation(() => AuthMemberDto)
	public async loginMember(@Args('input') input: LoginInput): Promise<AuthMemberDto> {
		return this.memberService.login(input);
	}
}
