import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, ClientSession } from 'mongoose';
import { AuthMemberDto } from '../../libs/dto/auth/auth-member';
import { LoginInput } from '../../libs/dto/auth/login.input';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MembersDto } from '../../libs/dto/common/members';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ResponseDto } from '../../libs/dto/common/response';
import { MemberStatus } from '../../libs/enums/member.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly authService: AuthService,
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
