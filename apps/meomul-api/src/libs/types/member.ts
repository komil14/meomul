import type { Document } from 'mongoose';
import type { MemberDto } from '../dto/member/member';
import type { MemberAuthType, MemberStatus, MemberType } from '../enums/member.enum';

export type MemberDocument = MemberDto & Document;

export type MemberJwtPayload = {
	_id: string;
	sub: string;
	memberNick: string;
	memberType: MemberType;
	memberStatus: MemberStatus;
	memberAuthType: MemberAuthType;
};
