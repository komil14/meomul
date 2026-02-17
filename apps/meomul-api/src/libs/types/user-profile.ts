import type { Document, Types } from 'mongoose';

export interface UserProfileDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	preferredLocations: string[];
	preferredTypes: string[];
	preferredPurposes: string[];
	preferredAmenities: string[];
	avgPriceMin?: number;
	avgPriceMax?: number;
	viewedHotelIds: Types.ObjectId[];
	likedHotelIds: Types.ObjectId[];
	bookedHotelIds: Types.ObjectId[];
	source?: 'onboarding' | 'computed';
	computedAt: Date;
	createdAt: Date;
	updatedAt: Date;
}
