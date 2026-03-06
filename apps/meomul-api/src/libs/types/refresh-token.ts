import type { Document, Types } from 'mongoose';

export interface RefreshTokenFields {
	tokenHash: string;
	memberId: Types.ObjectId;
	expiresAt: Date;
	revoked: boolean;
}

export type RefreshTokenDocument = RefreshTokenFields & Document;
