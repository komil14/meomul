import type { Document, Types } from 'mongoose';
import { ReviewDto, HotelResponseDto } from '../dto/review/review';
import { ReviewStatus } from '../enums/common.enum';

export interface HotelResponseDocument {
	responseText: string;
	respondedBy: Types.ObjectId;
	respondedAt: Date;
}

export interface ReviewDocument extends Document {
	_id: Types.ObjectId;
	reviewerId: Types.ObjectId;
	hotelId: Types.ObjectId;
	bookingId: Types.ObjectId;
	verifiedStay: boolean;
	stayDate: Date;
	overallRating: number;
	cleanlinessRating: number;
	locationRating: number;
	valueRating: number;
	serviceRating: number;
	amenitiesRating: number;
	reviewTitle?: string;
	reviewText: string;
	guestPhotos: string[];
	helpfulCount: number;
	reviewViews: number;
	hotelResponse?: HotelResponseDocument;
	reviewStatus: ReviewStatus;
	createdAt: Date;
	updatedAt: Date;
}

function toHotelResponseDto(response: HotelResponseDocument): HotelResponseDto {
	return {
		responseText: response.responseText,
		respondedBy: response.respondedBy as unknown as any,
		respondedAt: response.respondedAt,
	};
}

export function toReviewDto(doc: ReviewDocument): ReviewDto {
	return {
		_id: doc._id as unknown as any,
		reviewerId: doc.reviewerId as unknown as any,
		hotelId: doc.hotelId as unknown as any,
		bookingId: doc.bookingId as unknown as any,
		verifiedStay: doc.verifiedStay,
		stayDate: doc.stayDate,
		overallRating: doc.overallRating,
		cleanlinessRating: doc.cleanlinessRating,
		locationRating: doc.locationRating,
		valueRating: doc.valueRating,
		serviceRating: doc.serviceRating,
		amenitiesRating: doc.amenitiesRating,
		reviewTitle: doc.reviewTitle,
		reviewText: doc.reviewText,
		guestPhotos: doc.guestPhotos,
		helpfulCount: doc.helpfulCount,
		reviewViews: doc.reviewViews,
		hotelResponse: doc.hotelResponse && doc.hotelResponse.responseText ? toHotelResponseDto(doc.hotelResponse) : undefined,
		reviewStatus: doc.reviewStatus,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
