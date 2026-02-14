import { registerEnumType } from '@nestjs/graphql';

export enum LikeGroup {
	MEMBER = 'MEMBER',
	HOTEL = 'HOTEL',
	ARTICLE = 'ARTICLE',
	REVIEW = 'REVIEW',
}

export enum ViewGroup {
	MEMBER = 'MEMBER',
	HOTEL = 'HOTEL',
	ARTICLE = 'ARTICLE',
	REVIEW = 'REVIEW',
}

export enum StayPurpose {
	BUSINESS = 'BUSINESS',
	ROMANTIC = 'ROMANTIC',
	FAMILY = 'FAMILY',
	SOLO = 'SOLO',
	STAYCATION = 'STAYCATION',
	EVENT = 'EVENT',
	MEDICAL = 'MEDICAL',
	LONG_TERM = 'LONG_TERM',
}

export enum DemandLevel {
	LOW = 'LOW',
	MEDIUM = 'MEDIUM',
	HIGH = 'HIGH',
}

export enum ChatStatus {
	WAITING = 'WAITING',
	ACTIVE = 'ACTIVE',
	CLOSED = 'CLOSED',
}

export enum MessageType {
	TEXT = 'TEXT',
	IMAGE = 'IMAGE',
	FILE = 'FILE',
}

export enum SenderType {
	GUEST = 'GUEST',
	AGENT = 'AGENT',
}

export enum ReviewStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	FLAGGED = 'FLAGGED',
	REMOVED = 'REMOVED',
}

export enum NotificationType {
	PRICE_DROP = 'PRICE_DROP',
	BOOKING_REMINDER = 'BOOKING_REMINDER',
	REVIEW_REQUEST = 'REVIEW_REQUEST',
	HOTEL_REPLY = 'HOTEL_REPLY',
	LOW_AVAILABILITY = 'LOW_AVAILABILITY',
	CHAT_MESSAGE = 'CHAT_MESSAGE',
	POINTS_EARNED = 'POINTS_EARNED',
	NEW_HOTEL = 'NEW_HOTEL',
	NEW_BOOKING = 'NEW_BOOKING',
	BOOKING_CANCELLED = 'BOOKING_CANCELLED',
	NEW_REVIEW = 'NEW_REVIEW',
	NEW_MEMBER = 'NEW_MEMBER',
	SUBSCRIPTION_REQUEST = 'SUBSCRIPTION_REQUEST',
	SUBSCRIPTION_APPROVED = 'SUBSCRIPTION_APPROVED',
}

registerEnumType(LikeGroup, { name: 'LikeGroup' });
registerEnumType(ViewGroup, { name: 'ViewGroup' });
registerEnumType(StayPurpose, { name: 'StayPurpose' });
registerEnumType(DemandLevel, { name: 'DemandLevel' });
registerEnumType(ChatStatus, { name: 'ChatStatus' });
registerEnumType(MessageType, { name: 'MessageType' });
registerEnumType(SenderType, { name: 'SenderType' });
registerEnumType(ReviewStatus, { name: 'ReviewStatus' });
registerEnumType(NotificationType, { name: 'NotificationType' });
