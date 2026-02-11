import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, genSalt, hash } from 'bcryptjs';

@Injectable()
export class AuthService {
	constructor(private readonly jwtService: JwtService) {}

	public async hashPassword(plainPassword: string): Promise<string> {
		const salt = await genSalt(10);
		return hash(plainPassword, salt);
	}

	public async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
		return compare(plainPassword, hashedPassword);
	}

	public async generateJwtToken(member: any): Promise<string> {
		return this.jwtService.signAsync({
			sub: member._id?.toString?.() ?? member._id,
			memberNick: member.memberNick,
			memberType: member.memberType,
			memberStatus: member.memberStatus,
			memberAuthType: member.memberAuthType,
		});
	}

	public async verifyToken(token: string): Promise<any> {
		return this.jwtService.verifyAsync(token);
	}
}
