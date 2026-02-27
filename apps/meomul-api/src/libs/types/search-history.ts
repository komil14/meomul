import type { Document, Types } from 'mongoose';
import { SearchHistoryDto } from '../dto/search-history/search-history';
import { StayPurpose } from '../enums/common.enum';
import { HotelLocation, HotelType } from '../enums/hotel.enum';

export interface SearchHistoryDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	location?: HotelLocation;
	hotelTypes: HotelType[];
	priceMin?: number;
	priceMax?: number;
	purpose?: StayPurpose;
	amenities: string[];
	starRatings: number[];
	guestCount?: number;
	text?: string;
	fingerprint?: string;
	createdAt: Date;
}

export function toSearchHistoryDto(doc: SearchHistoryDocument): SearchHistoryDto {
	return {
		_id: doc._id as unknown as SearchHistoryDto['_id'],
		memberId: doc.memberId as unknown as SearchHistoryDto['memberId'],
		location: doc.location,
		hotelTypes: doc.hotelTypes,
		priceMin: doc.priceMin,
		priceMax: doc.priceMax,
		purpose: doc.purpose,
		amenities: doc.amenities,
		starRatings: doc.starRatings,
		guestCount: doc.guestCount,
		text: doc.text,
		createdAt: doc.createdAt,
	};
}
