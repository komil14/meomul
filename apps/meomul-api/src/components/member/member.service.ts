import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
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

	public async updateMember(currentMember: any, input: MemberUpdate): Promise<any> {
		if (!currentMember?._id) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const updateData = this.buildUpdatePayload(input, false);
		return this.updateMemberById(currentMember._id, updateData);
	}

	public async updateMemberByAdmin(input: MemberUpdate): Promise<any> {
		if (!input._id) {
			throw new BadRequestException('Member id is required');
		}

		const updateData = this.buildUpdatePayload(input, true);
		return this.updateMemberById(input._id, updateData);
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

	private async updateMemberById(memberId: string, updateData: Record<string, unknown>): Promise<any> {
		if (updateData.memberNick) {
			const existing = await this.memberModel.findOne({ memberNick: updateData.memberNick });
			if (existing && String(existing._id) !== String(memberId)) {
				throw new BadRequestException('Already used member nick');
			}
		}

		const updatedMember = await this.memberModel.findByIdAndUpdate(memberId, updateData, { new: true }).exec();

		if (!updatedMember) {
			throw new BadRequestException('Member not found');
		}

		return updatedMember;
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
