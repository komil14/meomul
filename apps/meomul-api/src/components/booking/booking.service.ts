import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { BookingInput } from '../../libs/dto/booking/booking.input';
import { BookingUpdate } from '../../libs/dto/booking/booking.update';
import { BookingDto } from '../../libs/dto/booking/booking';
import { BookingsDto } from '../../libs/dto/common/bookings';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { BookingStatus, PaymentStatus } from '../../libs/enums/booking.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { BookingDocument } from '../../libs/types/booking';
import { toBookingDto } from '../../libs/types/booking';
import type { RoomDocument } from '../../libs/types/room';
import type { HotelDocument } from '../../libs/types/hotel';

@Injectable()
export class BookingService {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
	) {}

	/**
	 * Create a new booking with price calculation
	 */
	public async createBooking(currentMember: MemberJwtPayload, input: BookingInput): Promise<BookingDto> {
		// Check member status
		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}

		// Verify hotel exists
		const hotel = await this.hotelModel.findById(input.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Calculate nights
		const checkIn = new Date(input.checkInDate);
		const checkOut = new Date(input.checkOutDate);
		const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

		if (nights < 1) {
			throw new BadRequestException('Check-out date must be after check-in date');
		}

		// Verify all rooms exist and have availability
		const roomIds = input.rooms.map((r) => r.roomId);
		const rooms = await this.roomModel.find({ _id: { $in: roomIds } }).exec();

		if (rooms.length !== roomIds.length) {
			throw new NotFoundException('One or more rooms not found');
		}

		// Check all rooms belong to the hotel
		const invalidRooms = rooms.filter((room) => String(room.hotelId) !== String(input.hotelId));
		if (invalidRooms.length > 0) {
			throw new BadRequestException('All rooms must belong to the specified hotel');
		}

		// Check room availability and status
		for (const inputRoom of input.rooms) {
			const room = rooms.find((r) => String(r._id) === inputRoom.roomId);
			if (!room) continue;

			if (room.roomStatus !== RoomStatus.AVAILABLE) {
				throw new BadRequestException(`Room ${room.roomName} is not available`);
			}

			if (room.availableRooms < inputRoom.quantity) {
				throw new BadRequestException(
					`Not enough rooms available for ${room.roomName}. Available: ${room.availableRooms}, Requested: ${inputRoom.quantity}`,
				);
			}

			// Verify price matches (prevent price manipulation)
			const expectedPrice = room.basePrice;
			if (inputRoom.pricePerNight !== expectedPrice) {
				throw new BadRequestException(
					`Price mismatch for ${room.roomName}. Expected: ${expectedPrice}, Provided: ${inputRoom.pricePerNight}`,
				);
			}
		}

		// Calculate pricing
		let subtotal = 0;
		for (const inputRoom of input.rooms) {
			subtotal += inputRoom.quantity * inputRoom.pricePerNight * nights;
		}

		// Calculate weekend surcharge (assume Friday and Saturday are weekend)
		let weekendNights = 0;
		for (let i = 0; i < nights; i++) {
			const currentDate = new Date(checkIn);
			currentDate.setDate(currentDate.getDate() + i);
			const dayOfWeek = currentDate.getDay();
			if (dayOfWeek === 5 || dayOfWeek === 6) {
				// Friday or Saturday
				weekendNights++;
			}
		}

		let weekendSurcharge = 0;
		for (const inputRoom of input.rooms) {
			const room = rooms.find((r) => String(r._id) === inputRoom.roomId);
			if (room && room.weekendSurcharge) {
				weekendSurcharge += inputRoom.quantity * room.weekendSurcharge * weekendNights;
			}
		}

		// Calculate additional fees
		const earlyCheckInFee = input.earlyCheckIn ? 30000 : 0; // 30,000 KRW
		const lateCheckOutFee = input.lateCheckOut ? 30000 : 0; // 30,000 KRW

		// Calculate taxes and service fee
		const taxes = Math.round(subtotal * 0.1); // 10% tax
		const serviceFee = Math.round(subtotal * 0.05); // 5% service fee

		const totalPrice = subtotal + weekendSurcharge + earlyCheckInFee + lateCheckOutFee + taxes + serviceFee;

		// Generate unique booking code
		const bookingCode = this.generateBookingCode();

		// Create booking
		const booking = await this.bookingModel.create({
			guestId: currentMember._id,
			hotelId: input.hotelId,
			rooms: input.rooms,
			checkInDate: input.checkInDate,
			checkOutDate: input.checkOutDate,
			nights,
			adultCount: input.adultCount,
			childCount: input.childCount,
			subtotal,
			weekendSurcharge,
			earlyCheckInFee,
			lateCheckOutFee,
			taxes,
			serviceFee,
			discount: 0,
			totalPrice,
			paymentMethod: input.paymentMethod,
			paymentStatus: PaymentStatus.PENDING,
			paidAmount: 0,
			bookingStatus: BookingStatus.PENDING,
			specialRequests: input.specialRequests,
			earlyCheckIn: input.earlyCheckIn,
			lateCheckOut: input.lateCheckOut,
			ageVerified: false,
			bookingCode,
		});

		// Update room availability
		for (const inputRoom of input.rooms) {
			await this.roomModel
				.findByIdAndUpdate(inputRoom.roomId, {
					$inc: { availableRooms: -inputRoom.quantity },
				})
				.exec();
		}

		return toBookingDto(booking);
	}

	/**
	 * Get single booking by ID
	 */
	public async getBooking(currentMember: MemberJwtPayload, bookingId: string): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only guest or hotel owner can view booking
		const hotel = await this.hotelModel.findById(booking.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const isGuest = String(booking.guestId) === String(currentMember._id);
		const isHotelOwner = String(hotel.memberId) === String(currentMember._id);
		const isAdmin = currentMember.memberType === MemberType.ADMIN;

		if (!isGuest && !isHotelOwner && !isAdmin) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		return toBookingDto(booking);
	}

	/**
	 * Get user's bookings
	 */
	public async getMyBookings(currentMember: MemberJwtPayload, input: PaginationInput): Promise<BookingsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			guestId: currentMember._id,
		};

		const [list, total] = await Promise.all([
			this.bookingModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.bookingModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toBookingDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get hotel agent's bookings
	 */
	public async getAgentBookings(
		currentMember: MemberJwtPayload,
		hotelId: string,
		input: PaginationInput,
	): Promise<BookingsDto> {
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Verify hotel ownership
		const hotel = await this.hotelModel.findById(hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			hotelId,
		};

		const [list, total] = await Promise.all([
			this.bookingModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.bookingModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toBookingDto),
			metaCounter: { total },
		};
	}

	/**
	 * Update booking status (for state machine)
	 */
	public async updateBookingStatus(
		currentMember: MemberJwtPayload,
		bookingId: string,
		newStatus: BookingStatus,
	): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Verify hotel ownership (only hotel owner can update status)
		const hotel = await this.hotelModel.findById(booking.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Validate state transitions
		this.validateStatusTransition(booking.bookingStatus, newStatus);

		const updatedBooking = await this.bookingModel
			.findByIdAndUpdate(
				bookingId,
				{
					bookingStatus: newStatus,
				},
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedBooking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toBookingDto(updatedBooking);
	}

	/**
	 * Cancel booking with refund
	 */
	public async cancelBooking(
		currentMember: MemberJwtPayload,
		bookingId: string,
		reason: string,
	): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only guest can cancel their booking
		if (String(booking.guestId) !== String(currentMember._id)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Can only cancel PENDING or CONFIRMED bookings
		if (booking.bookingStatus !== BookingStatus.PENDING && booking.bookingStatus !== BookingStatus.CONFIRMED) {
			throw new BadRequestException('Only pending or confirmed bookings can be cancelled');
		}

		// Calculate refund amount based on cancellation policy
		const refundAmount = this.calculateRefundAmount(booking);

		// Restore room availability
		for (const room of booking.rooms) {
			await this.roomModel
				.findByIdAndUpdate(room.roomId, {
					$inc: { availableRooms: room.quantity },
				})
				.exec();
		}

		const updatedBooking = await this.bookingModel
			.findByIdAndUpdate(
				bookingId,
				{
					bookingStatus: BookingStatus.CANCELLED,
					cancellationDate: new Date(),
					cancellationReason: reason,
					refundAmount,
					paymentStatus: refundAmount > 0 ? PaymentStatus.REFUNDED : booking.paymentStatus,
				},
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedBooking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toBookingDto(updatedBooking);
	}

	/**
	 * Update payment status
	 */
	public async updatePaymentStatus(
		currentMember: MemberJwtPayload,
		bookingId: string,
		paymentStatus: PaymentStatus,
		paidAmount: number,
	): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Verify hotel ownership (only hotel owner can update payment)
		const hotel = await this.hotelModel.findById(booking.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const updateData: Record<string, unknown> = {
			paymentStatus,
			paidAmount,
		};

		if (paymentStatus === PaymentStatus.PAID) {
			updateData.paidAt = new Date();
		}

		const updatedBooking = await this.bookingModel
			.findByIdAndUpdate(bookingId, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedBooking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toBookingDto(updatedBooking);
	}

	/**
	 * Generate unique booking code
	 */
	private generateBookingCode(): string {
		const timestamp = Date.now().toString(36).toUpperCase();
		const random = Math.random().toString(36).substring(2, 8).toUpperCase();
		return `BK${timestamp}${random}`;
	}

	/**
	 * Validate booking status transitions
	 */
	private validateStatusTransition(currentStatus: BookingStatus, newStatus: BookingStatus): void {
		const validTransitions: Record<BookingStatus, BookingStatus[]> = {
			[BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
			[BookingStatus.CONFIRMED]: [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
			[BookingStatus.CHECKED_IN]: [BookingStatus.CHECKED_OUT],
			[BookingStatus.CHECKED_OUT]: [],
			[BookingStatus.CANCELLED]: [],
			[BookingStatus.NO_SHOW]: [],
		};

		const allowedTransitions = validTransitions[currentStatus] || [];
		if (!allowedTransitions.includes(newStatus)) {
			throw new BadRequestException(
				`Invalid status transition from ${currentStatus} to ${newStatus}`,
			);
		}
	}

	/**
	 * Calculate refund amount based on cancellation policy
	 */
	private calculateRefundAmount(booking: BookingDocument): number {
		const now = new Date();
		const checkInDate = new Date(booking.checkInDate);
		const daysUntilCheckIn = Math.ceil((checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		// Cancellation policy:
		// - More than 7 days before check-in: 100% refund
		// - 3-7 days before check-in: 50% refund
		// - Less than 3 days before check-in: No refund

		if (daysUntilCheckIn > 7) {
			return booking.paidAmount;
		} else if (daysUntilCheckIn >= 3) {
			return Math.round(booking.paidAmount * 0.5);
		} else {
			return 0;
		}
	}
}
