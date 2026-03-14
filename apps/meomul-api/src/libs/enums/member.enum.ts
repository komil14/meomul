import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
	USER = 'USER',
	AGENT = 'AGENT',
	ADMIN = 'ADMIN',
	ADMIN_OPERATOR = 'ADMIN_OPERATOR',
}

export enum MemberStatus {
	ACTIVE = 'ACTIVE',
	BLOCK = 'BLOCK',
	DELETE = 'DELETE',
}

export enum MemberAuthType {
	PHONE = 'PHONE',
	EMAIL = 'EMAIL',
	KAKAO = 'KAKAO',
	NAVER = 'NAVER',
	GOOGLE = 'GOOGLE',
}

export enum SubscriptionTier {
	FREE = 'FREE',
	BASIC = 'BASIC',
	PREMIUM = 'PREMIUM',
	ELITE = 'ELITE',
}

export enum HostApplicationStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}

export enum HostAccessStatus {
	NONE = 'NONE',
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}

registerEnumType(MemberType, { name: 'MemberType' });
registerEnumType(MemberStatus, { name: 'MemberStatus' });
registerEnumType(MemberAuthType, { name: 'MemberAuthType' });
registerEnumType(SubscriptionTier, { name: 'SubscriptionTier' });
registerEnumType(HostApplicationStatus, { name: 'HostApplicationStatus' });
registerEnumType(HostAccessStatus, { name: 'HostAccessStatus' });
