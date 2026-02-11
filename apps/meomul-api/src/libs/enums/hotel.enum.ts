import { registerEnumType } from '@nestjs/graphql';

export enum HotelType {
	MOTEL = 'MOTEL',
	HOTEL = 'HOTEL',
	PENSION = 'PENSION',
	RESORT = 'RESORT',
	GUESTHOUSE = 'GUESTHOUSE',
	HANOK = 'HANOK',
}

export enum HotelLocation {
	SEOUL = 'SEOUL',
	BUSAN = 'BUSAN',
	INCHEON = 'INCHEON',
	DAEGU = 'DAEGU',
	GWANGJU = 'GWANGJU',
	DAEJON = 'DAEJON',
	JEJU = 'JEJU',
	GYEONGJU = 'GYEONGJU',
	GANGNEUNG = 'GANGNEUNG',
}

export enum HotelStatus {
	PENDING = 'PENDING',
	ACTIVE = 'ACTIVE',
	INACTIVE = 'INACTIVE',
	SUSPENDED = 'SUSPENDED',
	DELETE = 'DELETE',
}

export enum VerificationStatus {
	PENDING = 'PENDING',
	VERIFIED = 'VERIFIED',
	REJECTED = 'REJECTED',
}

export enum BadgeLevel {
	NONE = 'NONE',
	VERIFIED = 'VERIFIED',
	INSPECTED = 'INSPECTED',
	SUPERHOST = 'SUPERHOST',
}

export enum CancellationPolicy {
	FLEXIBLE = 'FLEXIBLE',
	MODERATE = 'MODERATE',
	STRICT = 'STRICT',
}

registerEnumType(HotelType, { name: 'HotelType' });
registerEnumType(HotelLocation, { name: 'HotelLocation' });
registerEnumType(HotelStatus, { name: 'HotelStatus' });
registerEnumType(VerificationStatus, { name: 'VerificationStatus' });
registerEnumType(BadgeLevel, { name: 'BadgeLevel' });
registerEnumType(CancellationPolicy, { name: 'CancellationPolicy' });
