import type { Document, Types } from 'mongoose';

export interface SearchHistoryDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	location?: string;
	hotelTypes: string[];
	priceMin?: number;
	priceMax?: number;
	purpose?: string;
	amenities: string[];
	starRatings: number[];
	guestCount?: number;
	text?: string;
	createdAt: Date;
}
