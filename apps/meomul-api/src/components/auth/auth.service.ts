import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { compare, genSalt, hash } from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import type { Model } from 'mongoose';
import { HostAccessStatus } from '../../libs/enums/member.enum';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { RefreshTokenDocument } from '../../libs/types/refresh-token';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		@InjectModel('RefreshToken') private readonly refreshTokenModel: Model<RefreshTokenDocument>,
	) {}

	public async hashPassword(plainPassword: string): Promise<string> {
		const salt = await genSalt(10);
		return hash(plainPassword, salt);
	}

	public async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
		return compare(plainPassword, hashedPassword);
	}

	public async generateJwtToken(member: MemberDocument): Promise<string> {
		return this.jwtService.signAsync({
			_id: member._id?.toString?.() ?? member._id,
			sub: member._id?.toString?.() ?? member._id,
			memberNick: member.memberNick,
			memberType: member.memberType,
			memberStatus: member.memberStatus,
			hostAccessStatus: member.hostAccessStatus ?? HostAccessStatus.NONE,
			memberAuthType: member.memberAuthType,
		});
	}

	public async verifyToken(token: string): Promise<MemberJwtPayload> {
		return this.jwtService.verifyAsync(token);
	}

	// ── Refresh tokens ─────────────────────────────────────────────────

	/**
	 * Generate a cryptographically secure refresh token, store its hash,
	 * and return the raw token (to be set as an httpOnly cookie).
	 */
	public async createRefreshToken(memberId: string): Promise<string> {
		const rawToken = randomBytes(40).toString('hex');
		const tokenHash = this.hashRefreshToken(rawToken);
		const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

		await this.refreshTokenModel.create({
			tokenHash,
			memberId,
			expiresAt,
		});

		return rawToken;
	}

	/**
	 * Validate a refresh token: check it exists, is not revoked/expired,
	 * return the associated memberId if valid.
	 */
	public async validateRefreshToken(rawToken: string): Promise<string | null> {
		const tokenHash = this.hashRefreshToken(rawToken);
		const doc = await this.refreshTokenModel.findOne({
			tokenHash,
			revoked: false,
		});

		if (!doc) return null;
		if (doc.expiresAt < new Date()) {
			// Expired — clean up
			await this.refreshTokenModel.deleteOne({ _id: doc._id });
			return null;
		}

		return doc.memberId.toString();
	}

	/**
	 * Revoke a specific refresh token (used on logout).
	 */
	public async revokeRefreshToken(rawToken: string): Promise<void> {
		const tokenHash = this.hashRefreshToken(rawToken);
		await this.refreshTokenModel.updateOne({ tokenHash }, { revoked: true });
	}

	/**
	 * Revoke ALL refresh tokens for a member (used on password change, ban, etc.).
	 */
	public async revokeAllMemberTokens(memberId: string): Promise<void> {
		await this.refreshTokenModel.updateMany({ memberId, revoked: false }, { revoked: true });
	}

	private hashRefreshToken(rawToken: string): string {
		return createHash('sha256').update(rawToken).digest('hex');
	}
}
