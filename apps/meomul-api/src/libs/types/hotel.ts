import type { Document, Types } from 'mongoose';
import type { HotelDto } from '../dto/hotel/hotel';

/**
 * Mongoose Document type for Hotel
 */
export interface HotelDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	hotelType: string;
	hotelTitle: string;
	hotelDesc: string;
	hotelLocation: string;
	detailedLocation: any;
	starRating: number;
	checkInTime: string;
	checkOutTime: string;
	flexibleCheckIn: any;
	flexibleCheckOut: any;
	verificationStatus: string;
	badgeLevel: string;
	verificationDocs: any;
	lastInspectionDate?: Date;
	cancellationPolicy: string;
	ageRestriction: number;
	petsAllowed: boolean;
	maxPetWeight?: number;
	smokingAllowed: boolean;
	amenities: any;
	safetyFeatures: any;
	safeStayCertified: boolean;
	suitableFor: string[];
	hotelImages: string[];
	hotelVideos: string[];
	hotelViews: number;
	hotelLikes: number;
	hotelReviews: number;
	hotelRating: number;
	hotelRank: number;
	warningStrikes: number;
	strikeHistory: any[];
	hotelStatus: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt?: Date;
}

/**
 * Convert Mongoose HotelDocument to HotelDto
 */
export function toHotelDto(doc: HotelDocument): HotelDto {
	return {
		_id: doc._id as any,
		memberId: doc.memberId as any,
		hotelType: doc.hotelType as any,
		hotelTitle: doc.hotelTitle,
		hotelDesc: doc.hotelDesc,
		hotelLocation: doc.hotelLocation as any,
		detailedLocation: doc.detailedLocation,
		starRating: doc.starRating,
		checkInTime: doc.checkInTime,
		checkOutTime: doc.checkOutTime,
		flexibleCheckIn: doc.flexibleCheckIn,
		flexibleCheckOut: doc.flexibleCheckOut,
		verificationStatus: doc.verificationStatus as any,
		badgeLevel: doc.badgeLevel as any,
		verificationDocs: doc.verificationDocs,
		lastInspectionDate: doc.lastInspectionDate,
		cancellationPolicy: doc.cancellationPolicy as any,
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
		warningStrikes: doc.warningStrikes,
		strikeHistory: (doc.strikeHistory || []).map((s: any) => ({
			bookingId: String(s.bookingId),
			reason: s.reason,
			date: s.date,
		})),
		hotelStatus: doc.hotelStatus as any,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
		deletedAt: doc.deletedAt,
	};
}
