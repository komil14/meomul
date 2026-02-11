import { registerEnumType } from '@nestjs/graphql';

export enum RoomType {
	STANDARD = 'STANDARD',
	DELUXE = 'DELUXE',
	SUITE = 'SUITE',
	PREMIUM = 'PREMIUM',
	PENTHOUSE = 'PENTHOUSE',
	FAMILY = 'FAMILY',
}

export enum RoomStatus {
	AVAILABLE = 'AVAILABLE',
	BOOKED = 'BOOKED',
	MAINTENANCE = 'MAINTENANCE',
	INACTIVE = 'INACTIVE',
}

export enum BedType {
	SINGLE = 'SINGLE',
	DOUBLE = 'DOUBLE',
	QUEEN = 'QUEEN',
	KING = 'KING',
	TWIN = 'TWIN',
}

export enum ViewType {
	CITY = 'CITY',
	OCEAN = 'OCEAN',
	MOUNTAIN = 'MOUNTAIN',
	GARDEN = 'GARDEN',
	NONE = 'NONE',
}

registerEnumType(RoomType, { name: 'RoomType' });
registerEnumType(RoomStatus, { name: 'RoomStatus' });
registerEnumType(BedType, { name: 'BedType' });
registerEnumType(ViewType, { name: 'ViewType' });
