import { registerEnumType } from '@nestjs/graphql';

export enum BookingStatus {
	PENDING = 'PENDING',
	CONFIRMED = 'CONFIRMED',
	CHECKED_IN = 'CHECKED_IN',
	CHECKED_OUT = 'CHECKED_OUT',
	CANCELLED = 'CANCELLED',
	NO_SHOW = 'NO_SHOW',
}

export enum PaymentStatus {
	PENDING = 'PENDING',
	PAID = 'PAID',
	PARTIAL = 'PARTIAL',
	REFUNDED = 'REFUNDED',
	FAILED = 'FAILED',
}

export enum PaymentMethod {
	DEBIT_CARD = 'DEBIT_CARD',
	CREDIT_CARD = 'CREDIT_CARD',
	KAKAOPAY = 'KAKAOPAY',
	TOSS = 'TOSS',
	NAVERPAY = 'NAVERPAY',
	AT_HOTEL = 'AT_HOTEL',
}

registerEnumType(BookingStatus, { name: 'BookingStatus' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(PaymentMethod, { name: 'PaymentMethod' });
