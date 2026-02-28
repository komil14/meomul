import type { Document, Types } from 'mongoose';
import type { HotelDto } from '../dto/hotel/hotel';

type HotelStrikeHistoryEntry = HotelDto['strikeHistory'][number];

/**
 * Mongoose Document type for Hotel
 */
export interface HotelDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	hotelType: HotelDto['hotelType'];
	hotelTitle: string;
	hotelDesc: string;
	hotelLocation: HotelDto['hotelLocation'];
	detailedLocation: HotelDto['detailedLocation'];
	starRating: number;
	checkInTime: string;
	checkOutTime: string;
	flexibleCheckIn: HotelDto['flexibleCheckIn'];
	flexibleCheckOut: HotelDto['flexibleCheckOut'];
	verificationStatus: HotelDto['verificationStatus'];
	badgeLevel: HotelDto['badgeLevel'];
	verificationDocs: HotelDto['verificationDocs'];
	lastInspectionDate?: Date;
	cancellationPolicy: HotelDto['cancellationPolicy'];
	ageRestriction: number;
	petsAllowed: boolean;
	maxPetWeight?: number;
	smokingAllowed: boolean;
	amenities: HotelDto['amenities'];
	safetyFeatures: HotelDto['safetyFeatures'];
	safeStayCertified: boolean;
	suitableFor: string[];
	hotelImages: string[];
	hotelVideos: string[];
	hotelViews: number;
	hotelLikes: number;
	hotelReviews: number;
	hotelRating: number;
	hotelRank: number;
	startingPrice: number;
	warningStrikes: number;
	strikeHistory: HotelStrikeHistoryEntry[];
	hotelStatus: HotelDto['hotelStatus'];
	createdAt: Date;
	updatedAt: Date;
	deletedAt?: Date;
}

/**
 * Convert Mongoose HotelDocument to HotelDto
 */
export function toHotelDto(doc: HotelDocument): HotelDto {
	return {
		_id: doc._id as unknown as HotelDto['_id'],
		memberId: doc.memberId as unknown as HotelDto['memberId'],
		hotelType: doc.hotelType,
		hotelTitle: doc.hotelTitle,
		hotelDesc: doc.hotelDesc,
		hotelLocation: doc.hotelLocation,
		detailedLocation: doc.detailedLocation,
		starRating: doc.starRating,
		checkInTime: doc.checkInTime,
		checkOutTime: doc.checkOutTime,
		flexibleCheckIn: doc.flexibleCheckIn,
		flexibleCheckOut: doc.flexibleCheckOut,
		verificationStatus: doc.verificationStatus,
		badgeLevel: doc.badgeLevel,
		verificationDocs: doc.verificationDocs,
		lastInspectionDate: doc.lastInspectionDate,
		cancellationPolicy: doc.cancellationPolicy,
		ageRestriction: doc.ageRestriction,
		petsAllowed: doc.petsAllowed,
		maxPetWeight: doc.maxPetWeight,
		smokingAllowed: doc.smokingAllowed,
		amenities: doc.amenities,
		safetyFeatures: doc.safetyFeatures,
		safeStayCertified: doc.safeStayCertified,
		suitableFor: doc.suitableFor,
		hotelImages: doc.hotelImages,
		hotelVideos: doc.hotelVideos,
		hotelViews: doc.hotelViews,
		hotelLikes: doc.hotelLikes,
		hotelReviews: doc.hotelReviews,
		hotelRating: doc.hotelRating,
		hotelRank: doc.hotelRank,
		startingPrice: doc.startingPrice ?? 0,
		warningStrikes: doc.warningStrikes,
		strikeHistory: (doc.strikeHistory || []).map((s) => ({
			bookingId: String(s.bookingId),
			reason: s.reason,
			date: s.date,
		})),
		hotelStatus: doc.hotelStatus,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
		deletedAt: doc.deletedAt,
	};
}
