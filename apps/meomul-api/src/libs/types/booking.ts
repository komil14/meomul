import type { Document, Types } from 'mongoose';
import { BookingDto, BookedRoomDto } from '../dto/booking/booking';
import { BookingStatus, PaymentStatus, PaymentMethod, CancellationFlow } from '../enums/booking.enum';
import { MemberType } from '../enums/member.enum';

export interface BookedRoomDocument {
	roomId: Types.ObjectId;
	roomType: string;
	quantity: number;
	pricePerNight: number;
	guestName?: string;
}

export interface BookingDocument extends Document {
	_id: Types.ObjectId;
	guestId: Types.ObjectId;
	hotelId: Types.ObjectId;
	rooms: BookedRoomDocument[];
	checkInDate: Date;
	checkOutDate: Date;
	nights: number;
	adultCount: number;
	childCount: number;
	subtotal: number;
	weekendSurcharge: number;
	earlyCheckInFee: number;
	lateCheckOutFee: number;
	taxes: number;
	serviceFee: number;
	discount: number;
	totalPrice: number;
	paymentMethod: PaymentMethod;
	paymentStatus: PaymentStatus;
	paidAmount: number;
	paidAt?: Date;
	bookingStatus: BookingStatus;
	specialRequests?: string;
	earlyCheckIn: boolean;
	lateCheckOut: boolean;
	cancellationDate?: Date;
	cancellationReason?: string;
	cancellationFlow?: CancellationFlow;
	cancelledByMemberId?: Types.ObjectId;
	cancelledByMemberType?: MemberType;
	refundAmount?: number;
	refundDate?: Date;
	refundReason?: string;
	refundEvidence?: string[];
	ageVerified: boolean;
	verificationMethod?: string;
	bookingCode: string;
	qrCode?: string;
	createdAt: Date;
	updatedAt: Date;
}

function toBookedRoomDto(room: BookedRoomDocument): BookedRoomDto {
	return {
		roomId: room.roomId as unknown as BookedRoomDto['roomId'],
		roomType: room.roomType,
		quantity: room.quantity,
		pricePerNight: room.pricePerNight,
		guestName: room.guestName,
	};
}

export function toBookingDto(doc: BookingDocument): BookingDto {
	return {
		_id: doc._id as unknown as BookingDto['_id'],
		guestId: doc.guestId as unknown as BookingDto['guestId'],
		hotelId: doc.hotelId as unknown as BookingDto['hotelId'],
		rooms: doc.rooms.map(toBookedRoomDto),
		checkInDate: doc.checkInDate,
		checkOutDate: doc.checkOutDate,
		nights: doc.nights,
		adultCount: doc.adultCount,
		childCount: doc.childCount,
		subtotal: doc.subtotal,
		weekendSurcharge: doc.weekendSurcharge,
		earlyCheckInFee: doc.earlyCheckInFee,
		lateCheckOutFee: doc.lateCheckOutFee,
		taxes: doc.taxes,
		serviceFee: doc.serviceFee,
		discount: doc.discount,
		totalPrice: doc.totalPrice,
		paymentMethod: doc.paymentMethod,
		paymentStatus: doc.paymentStatus,
		paidAmount: doc.paidAmount,
		paidAt: doc.paidAt,
		bookingStatus: doc.bookingStatus,
		specialRequests: doc.specialRequests,
		earlyCheckIn: doc.earlyCheckIn,
		lateCheckOut: doc.lateCheckOut,
			cancellationDate: doc.cancellationDate,
			cancellationReason: doc.cancellationReason,
			cancellationFlow: doc.cancellationFlow,
			cancelledByMemberId: doc.cancelledByMemberId?.toString(),
			cancelledByMemberType: doc.cancelledByMemberType,
			refundAmount: doc.refundAmount,
		refundDate: doc.refundDate,
		refundReason: doc.refundReason,
		refundEvidence: doc.refundEvidence,
		ageVerified: doc.ageVerified,
		verificationMethod: doc.verificationMethod,
		bookingCode: doc.bookingCode,
		qrCode: doc.qrCode,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
