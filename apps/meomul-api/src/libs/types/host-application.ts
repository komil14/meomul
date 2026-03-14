import type { Document, Types } from 'mongoose';
import { HostApplicationDto } from '../dto/member/host-application';
import { StayPurpose } from '../enums/common.enum';
import { HotelLocation, HotelType } from '../enums/hotel.enum';
import { HostApplicationStatus } from '../enums/member.enum';

export interface HostApplicationDocument extends Document {
	_id: Types.ObjectId;
	applicantMemberId: Types.ObjectId;
	businessName: string;
	businessDescription: string;
	contactPhone?: string;
	businessEmail?: string;
	intendedHotelName?: string;
	intendedHotelLocation?: HotelLocation;
	hotelType: HotelType;
	suitableFor: StayPurpose[];
	notes?: string;
	status: HostApplicationStatus;
	reviewedByMemberId?: Types.ObjectId;
	reviewNote?: string;
	reviewedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export function toHostApplicationDto(doc: HostApplicationDocument): HostApplicationDto {
	return {
		_id: doc._id.toString(),
		applicantMemberId: doc.applicantMemberId.toString(),
		applicantMemberNick: undefined,
		businessName: doc.businessName,
		businessDescription: doc.businessDescription,
		contactPhone: doc.contactPhone,
		businessEmail: doc.businessEmail,
		intendedHotelName: doc.intendedHotelName,
		intendedHotelLocation: doc.intendedHotelLocation,
		hotelType: doc.hotelType ?? HotelType.HOTEL,
		suitableFor: doc.suitableFor ?? [],
		notes: doc.notes,
		status: doc.status,
		reviewedByMemberId: doc.reviewedByMemberId?.toString(),
		reviewedByMemberNick: undefined,
		reviewNote: doc.reviewNote,
		reviewedAt: doc.reviewedAt,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
