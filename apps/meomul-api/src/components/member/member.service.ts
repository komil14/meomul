import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberStatus } from '../../libs/enums/member.enum';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<any>,
		private readonly authService: AuthService,
	) {}

	public async signup(input: MemberInput): Promise<AuthMemberDto> {
		const existing = await this.memberModel.findOne({
			$or: [{ memberNick: input.memberNick }, { memberPhone: input.memberPhone }],
		});
		if (existing) {
			throw new BadRequestException('Already used member nick or phone');
		}

		const memberPassword = await this.authService.hashPassword(input.memberPassword);
		const createdMember = await this.memberModel.create({
			...input,
			memberPassword,
		});
		const accessToken = await this.authService.generateJwtToken(createdMember);
		return this.toAuthMember(createdMember, accessToken);
	}

	public async login(input: LoginInput): Promise<AuthMemberDto> {
		const member = await this.memberModel.findOne({ memberNick: input.memberNick }).select('+memberPassword').exec();

		if (!member || member.memberStatus === MemberStatus.DELETE) {
			throw new UnauthorizedException('Invalid credentials');
		}

		if (member.memberStatus === MemberStatus.BLOCK) {
			throw new UnauthorizedException('User is blocked');
		}

		const isMatch = await this.authService.comparePassword(input.memberPassword, member.memberPassword);
		if (!isMatch) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const accessToken = await this.authService.generateJwtToken(member);
		return this.toAuthMember(member, accessToken);
	}

	private toAuthMember(member: any, accessToken: string): AuthMemberDto {
		const memberObject = typeof member.toObject === 'function' ? member.toObject() : { ...member };
		delete memberObject.memberPassword;

		return {
			...memberObject,
			accessToken,
		} as AuthMemberDto;
	}
}
