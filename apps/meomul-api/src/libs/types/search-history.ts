import type { Document, Types } from 'mongoose';
import { SearchHistoryDto } from '../dto/search-history/search-history';

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

export function toSearchHistoryDto(doc: SearchHistoryDocument): SearchHistoryDto {
	return {
		_id: doc._id as unknown as any,
		memberId: doc.memberId as unknown as any,
		location: doc.location as any,
		hotelTypes: doc.hotelTypes as any,
		priceMin: doc.priceMin,
		priceMax: doc.priceMax,
		purpose: doc.purpose as any,
		amenities: doc.amenities,
		starRatings: doc.starRatings,
		guestCount: doc.guestCount,
		text: doc.text,
		createdAt: doc.createdAt,
	};
}
