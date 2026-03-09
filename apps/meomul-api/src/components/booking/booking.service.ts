import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import type { Model } from 'mongoose';
import { BookingInput } from '../../libs/dto/booking/booking.input';
import { BookingDto } from '../../libs/dto/booking/booking';
import { BookingsDto } from '../../libs/dto/common/bookings';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { BookingStatus, CancellationFlow, PaymentStatus } from '../../libs/enums/booking.enum';
import { CancellationPolicy, HotelStatus } from '../../libs/enums/hotel.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { BookingDocument } from '../../libs/types/booking';
import { toBookingDto } from '../../libs/types/booking';
import type { RoomDocument } from '../../libs/types/room';
import type { HotelDocument } from '../../libs/types/hotel';
import { PriceLockService } from '../price-lock/price-lock.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/common.enum';
import { RoomInventoryService } from '../room-inventory/room-inventory.service';

@Injectable()
export class BookingService {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly priceLockService: PriceLockService,
		private readonly notificationService: NotificationService,
		private readonly roomInventoryService: RoomInventoryService,
	) {}

	/**
	 * Create a new booking with price calculation
	 */
	public async createBooking(currentMember: MemberJwtPayload, input: BookingInput): Promise<BookingDto> {
		// Check member status
		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}
		const bookingGuestId = await this.resolveBookingGuestId(currentMember, input.guestId);

		// Calculate nights
		const checkIn = new Date(input.checkInDate);
		const checkOut = new Date(input.checkOutDate);
		const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
		const today = this.normalizeToUtcDay(new Date());
		const normalizedCheckIn = this.normalizeToUtcDay(checkIn);

		if (nights < 1) {
			throw new BadRequestException('Check-out date must be after check-in date');
		}
		if (normalizedCheckIn < today) {
			throw new BadRequestException('Check-in date cannot be in the past');
		}

		// Check for duplicate roomIds in the booking
		const roomIds = input.rooms.map((r) => r.roomId);
		const uniqueRoomIds = new Set(roomIds);
		if (roomIds.length !== uniqueRoomIds.size) {
			throw new BadRequestException(
				'Duplicate rooms in booking. Use the quantity field to book multiple rooms of the same type',
			);
		}

		// Verify all rooms exist before opening a transaction (fast-fail)
		const rooms = await this.roomModel.find({ _id: { $in: roomIds } }).exec();
		if (rooms.length !== roomIds.length) {
			throw new NotFoundException('One or more rooms not found');
		}

		const hotel = await this.hotelModel.findById(input.hotelId).select('memberId hotelStatus').exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		if (hotel.hotelStatus !== HotelStatus.ACTIVE) {
			throw new BadRequestException('Hotel is not available for booking');
		}

		// Check room availability and status, verify prices (honoring price locks)
		for (const inputRoom of input.rooms) {
			const room = rooms.find((r) => String(r._id) === inputRoom.roomId);
			if (!room) continue;

			if (String(room.hotelId) !== String(input.hotelId)) {
				throw new BadRequestException('All rooms must belong to the specified hotel');
			}

			if (room.roomStatus !== RoomStatus.AVAILABLE) {
				throw new BadRequestException(`Room ${room.roomName} is not available`);
			}

			// Verify price matches — priority: Price Lock > Last-Minute Deal > Base Price
			const { price: expectedPrice } = await this.priceLockService.getEffectivePrice(bookingGuestId, inputRoom.roomId);
			if (inputRoom.pricePerNight !== expectedPrice) {
				throw new BadRequestException(
					`Price mismatch for ${room.roomName}. Expected: ${expectedPrice}, Provided: ${inputRoom.pricePerNight}`,
				);
			}
		}

		// Calculate pricing and discount from last-minute deals
		let subtotal = 0;
		let discount = 0;
		for (const inputRoom of input.rooms) {
			const room = rooms.find((r) => String(r._id) === inputRoom.roomId);
			subtotal += inputRoom.quantity * inputRoom.pricePerNight * nights;

			// Track discount: difference between base price and effective price (deal or lock)
			if (room && inputRoom.pricePerNight < room.basePrice) {
				discount += inputRoom.quantity * (room.basePrice - inputRoom.pricePerNight) * nights;
			}
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

		// Note: discount is already reflected in subtotal (pricePerNight is the effective/deal price)
		// The discount field records savings for display purposes only
		const totalPrice = subtotal + weekendSurcharge + earlyCheckInFee + lateCheckOutFee + taxes + serviceFee;

		// Generate unique booking code
		const bookingCode = this.generateBookingCode();
		const session = await this.bookingModel.db.startSession();
		let booking: BookingDocument | null = null;

		try {
			await session.withTransaction(async () => {
				const hotel = await this.hotelModel.findById(input.hotelId).session(session).exec();
				if (!hotel) {
					throw new NotFoundException(Messages.NO_DATA_FOUND);
				}
				if (hotel.hotelStatus !== HotelStatus.ACTIVE) {
					throw new BadRequestException('Hotel is not available for booking');
				}

				// AGENT can only create bookings for their own hotel
				if (currentMember.memberType === MemberType.AGENT && String(hotel.memberId) !== String(currentMember._id)) {
					throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
				}

				const txRooms = await this.roomModel
					.find({ _id: { $in: roomIds } })
					.session(session)
					.exec();
				if (txRooms.length !== roomIds.length) {
					throw new NotFoundException('One or more rooms not found');
				}

				const invalidRooms = txRooms.filter((room) => String(room.hotelId) !== String(input.hotelId));
				if (invalidRooms.length > 0) {
					throw new BadRequestException('All rooms must belong to the specified hotel');
				}

				for (const inputRoom of input.rooms) {
					const txRoom = txRooms.find((room) => String(room._id) === inputRoom.roomId);
					if (!txRoom) {
						throw new NotFoundException('One or more rooms not found');
					}
					const expectedPrice = await this.resolveEffectiveRoomPrice(bookingGuestId, txRoom);
					if (inputRoom.pricePerNight !== expectedPrice) {
						throw new BadRequestException(
							`Price changed for ${txRoom.roomName}. Expected: ${expectedPrice}, Provided: ${inputRoom.pricePerNight}`,
						);
					}

					await this.roomInventoryService.seedRoomInventory({
						roomId: inputRoom.roomId,
						totalRooms: txRoom.totalRooms,
						basePrice: txRoom.basePrice,
						startDate: checkIn,
						days: nights,
						session,
					});

					await this.roomInventoryService.reserveInventory({
						roomId: inputRoom.roomId,
						checkInDate: checkIn,
						checkOutDate: checkOut,
						quantity: inputRoom.quantity,
						session,
					});
				}

				const [createdBooking] = await this.bookingModel.create(
					[
						{
							guestId: bookingGuestId,
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
							discount,
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
						},
					],
					{ session },
				);

				booking = createdBooking;
			});
		} finally {
			await session.endSession();
		}

		if (!booking) {
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
		const createdBooking = booking as BookingDocument;
		const bookingGuestContext: MemberJwtPayload = {
			...currentMember,
			_id: bookingGuestId,
			sub: bookingGuestId,
		};

		// Remove any price locks the user had on these rooms (they've been used)
		for (const inputRoom of input.rooms) {
			const lock = await this.priceLockService.getMyPriceLock(bookingGuestContext, inputRoom.roomId);
			if (lock) {
				await this.priceLockService.cancelPriceLock(bookingGuestContext, lock._id);
			}
		}

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_BOOKING,
				'New Booking',
				`Booking ${bookingCode} created for hotel ${input.hotelId}`,
				`/admin/bookings/${createdBooking._id?.toString?.() ?? createdBooking._id}`,
			)
			.catch(() => {});

		// Notify the guest (fire-and-forget)
		this.notificationService
			.createAndPush(
				{
					userId: bookingGuestId,
					type: NotificationType.NEW_BOOKING,
					title: 'Booking Created',
					message: `Your booking ${bookingCode} has been created. We'll notify you once it's confirmed.`,
					link: `/bookings`,
				},
				'BOOKING',
			)
			.catch(() => {});

		// Notify the hotel agent (fire-and-forget)
		const agentHotel = await this.hotelModel.findById(input.hotelId).select('memberId hotelTitle').exec();
		if (agentHotel?.memberId) {
			this.notificationService
				.createAndPush(
					{
						userId: String(agentHotel.memberId),
						type: NotificationType.NEW_BOOKING,
						title: 'New Booking Received',
						message: `New booking ${bookingCode} for ${agentHotel.hotelTitle ?? 'your hotel'}.`,
						link: `/bookings`,
					},
					'BOOKING',
				)
				.catch(() => {});
		}

		// Invalidate recommendation cache for this user (fire-and-forget)
		Promise.all([
			this.cacheManager.set(`rec:v:${bookingGuestId}`, Date.now().toString(), 7 * 24 * 60 * 60 * 1000),
			this.cacheManager.del(`rec:${bookingGuestId}:10`),
			this.cacheManager.del(`rec:${bookingGuestId}:20`),
		]).catch(() => {});

		return toBookingDto(createdBooking);
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
		const isAdmin = this.isBackofficeOperator(currentMember.memberType);

		if (!isGuest && !isHotelOwner && !isAdmin) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		return toBookingDto(booking);
	}

	/**
	 * Get user's bookings
	 */
	public async getMyBookings(
		currentMember: MemberJwtPayload,
		input: PaginationInput,
		statusFilter?: BookingStatus,
	): Promise<BookingsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			guestId: currentMember._id,
			...(statusFilter ? { bookingStatus: statusFilter } : {}),
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

		// Batch-fetch hotel display data to avoid N+1 on the client
		const uniqueHotelIds = [...new Set(list.map((b) => String(b.hotelId)))];
		const hotels = uniqueHotelIds.length
			? await this.hotelModel
					.find({ _id: { $in: uniqueHotelIds } })
					.select('_id hotelTitle hotelLocation hotelType hotelImages')
					.exec()
			: [];
		const hotelMap = new Map(hotels.map((h) => [String(h._id), h]));

		return {
			list: list.map((doc) => {
				const dto = toBookingDto(doc);
				const hotel = hotelMap.get(String(doc.hotelId));
				if (hotel) {
					dto.hotelTitle = hotel.hotelTitle;
					dto.hotelLocation = String(hotel.hotelLocation ?? '');
					dto.hotelType = hotel.hotelType;
					dto.hotelImages = hotel.hotelImages ?? [];
				}
				return dto;
			}),
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
		const canManageAllHotels = this.isBackofficeOperator(currentMember.memberType);
		if (currentMember.memberType !== MemberType.AGENT && !canManageAllHotels) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Verify hotel ownership
		const hotel = await this.hotelModel.findById(hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (!canManageAllHotels && String(hotel.memberId) !== String(currentMember._id)) {
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
		if (newStatus === BookingStatus.CANCELLED) {
			throw new BadRequestException('Use cancellation mutations to cancel bookings safely');
		}

		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		await this.assertHotelBookingManagementAccess(currentMember, String(booking.hotelId));

		if (newStatus === BookingStatus.NO_SHOW && new Date(booking.checkInDate).getTime() > Date.now()) {
			throw new BadRequestException('NO_SHOW can only be set after check-in date');
		}
		if (newStatus === BookingStatus.CHECKED_IN && new Date(booking.checkInDate).getTime() > Date.now()) {
			throw new BadRequestException('CHECKED_IN can only be set on or after check-in date');
		}
		if (newStatus === BookingStatus.CHECKED_OUT && new Date(booking.checkOutDate).getTime() > Date.now()) {
			throw new BadRequestException('CHECKED_OUT can only be set on or after check-out date');
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

		// Notify guest about status change (fire-and-forget)
		this.notificationService
			.createAndPush(
				{
					userId: String(updatedBooking.guestId),
					type: NotificationType.BOOKING_REMINDER,
					title: `Booking ${newStatus}`,
					message: this.bookingStatusMessage(newStatus, updatedBooking.bookingCode),
					link: `/bookings`,
				},
				'BOOKING',
			)
			.catch(() => {});

		return toBookingDto(updatedBooking);
	}

	/**
	 * Cancel booking with refund
	 */
	public async cancelBooking(
		currentMember: MemberJwtPayload,
		bookingId: string,
		reason: string,
		evidencePhotos?: string[],
	): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (String(booking.guestId) !== String(currentMember._id)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		this.ensureGuestCancellationBeforeCheckIn(booking);

		const hotel = await this.hotelModel.findById(booking.hotelId).select('cancellationPolicy').exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const refundAmount = this.calculateGuestRefundAmount(booking, hotel.cancellationPolicy);
		return this.executeBookingCancellation(
			currentMember,
			booking,
			reason,
			refundAmount,
			CancellationFlow.GUEST,
			evidencePhotos,
		);
	}

	/**
	 * Cancel booking by hotel operators (agent/admin/admin-operator).
	 * This uses a dedicated policy: full refund of paid amount for operational cancellations.
	 */
	public async cancelBookingByOperator(
		currentMember: MemberJwtPayload,
		bookingId: string,
		reason: string,
		evidencePhotos?: string[],
	): Promise<BookingDto> {
		const booking = await this.bookingModel.findById(bookingId).exec();
		if (!booking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		await this.assertHotelBookingManagementAccess(currentMember, String(booking.hotelId));
		return this.executeBookingCancellation(
			currentMember,
			booking,
			reason,
			this.calculateOperatorRefundAmount(booking),
			CancellationFlow.OPERATOR,
			evidencePhotos,
		);
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

		await this.assertHotelBookingManagementAccess(currentMember, String(booking.hotelId));

		if (booking.bookingStatus === BookingStatus.CANCELLED || booking.bookingStatus === BookingStatus.NO_SHOW) {
			throw new BadRequestException(`Cannot update payment for ${booking.bookingStatus} bookings`);
		}

		if (paymentStatus === PaymentStatus.REFUNDED) {
			throw new BadRequestException('Use cancellation flow to process refunds');
		}

		// Validate payment amount
		if (paidAmount < 0) {
			throw new BadRequestException('Payment amount cannot be negative');
		}

		if (paidAmount > booking.totalPrice) {
			throw new BadRequestException(`Payment amount (${paidAmount}) cannot exceed total price (${booking.totalPrice})`);
		}

		// Validate payment status and amount consistency
		if (paymentStatus === PaymentStatus.PAID) {
			if (paidAmount !== booking.totalPrice) {
				throw new BadRequestException(`For PAID status, payment amount must equal total price (${booking.totalPrice})`);
			}
		}

		if (paymentStatus === PaymentStatus.PARTIAL) {
			if (paidAmount === 0 || paidAmount >= booking.totalPrice) {
				throw new BadRequestException(
					`For PARTIAL status, payment amount must be between 0 and total price (${booking.totalPrice})`,
				);
			}
		}

		if (paymentStatus === PaymentStatus.PENDING) {
			if (paidAmount !== 0) {
				throw new BadRequestException('For PENDING status, payment amount must be 0');
			}
		}

		if (paymentStatus === PaymentStatus.FAILED && paidAmount !== 0) {
			throw new BadRequestException('For FAILED status, payment amount must be 0');
		}

		const updateData: Record<string, unknown> = {
			paymentStatus,
			paidAmount,
		};

		if (paymentStatus === PaymentStatus.PAID) {
			updateData.paidAt = new Date();
		} else {
			updateData.paidAt = null;
		}

		const updatedBooking = await this.bookingModel
			.findByIdAndUpdate(bookingId, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedBooking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Notify guest about payment status change (fire-and-forget)
		if (paymentStatus === PaymentStatus.PAID) {
			this.notificationService
				.createAndPush(
					{
						userId: String(updatedBooking.guestId),
						type: NotificationType.POINTS_EARNED,
						title: 'Payment Confirmed',
						message: `Payment of ₩${paidAmount.toLocaleString()} for booking ${updatedBooking.bookingCode} has been confirmed.`,
						link: `/bookings`,
					},
					'PAYMENT',
				)
				.catch(() => {});
		}

		return toBookingDto(updatedBooking);
	}

	/**
	 * Get all bookings (admin only)
	 */
	public async getAllBookingsAdmin(input: PaginationInput, statusFilter?: BookingStatus): Promise<BookingsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {};
		if (statusFilter) {
			query.bookingStatus = statusFilter;
		}

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
	 * Generate unique booking code
	 */
	private generateBookingCode(): string {
		const timestamp = Date.now().toString(36).toUpperCase();
		const random = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
		return `BK${timestamp}${random}`;
	}

	/**
	 * Validate booking status transitions
	 */
	private validateStatusTransition(currentStatus: BookingStatus, newStatus: BookingStatus): void {
		const validTransitions: Record<BookingStatus, BookingStatus[]> = {
			[BookingStatus.PENDING]: [BookingStatus.CONFIRMED],
			[BookingStatus.CONFIRMED]: [BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW],
			[BookingStatus.CHECKED_IN]: [BookingStatus.CHECKED_OUT],
			[BookingStatus.CHECKED_OUT]: [],
			[BookingStatus.CANCELLED]: [],
			[BookingStatus.NO_SHOW]: [],
		};

		const allowedTransitions = validTransitions[currentStatus] || [];
		if (!allowedTransitions.includes(newStatus)) {
			throw new BadRequestException(`Invalid status transition from ${currentStatus} to ${newStatus}`);
		}
	}

	/**
	 * Validate operational access for booking management.
	 */
	private async assertHotelBookingManagementAccess(currentMember: MemberJwtPayload, hotelId: string): Promise<void> {
		if (this.isBackofficeOperator(currentMember.memberType)) {
			return;
		}

		if (currentMember.memberType !== MemberType.AGENT) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const hotel = await this.hotelModel.findById(hotelId).select('memberId').exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		if (String(hotel.memberId) !== String(currentMember._id)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
	}

	private isBackofficeOperator(memberType: MemberType): boolean {
		return memberType === MemberType.ADMIN || memberType === MemberType.ADMIN_OPERATOR;
	}

	private async resolveBookingGuestId(currentMember: MemberJwtPayload, requestedGuestId?: string): Promise<string> {
		const targetGuestId = requestedGuestId?.trim();
		const isStaff = currentMember.memberType !== MemberType.USER;

		if (!targetGuestId) {
			if (isStaff) {
				throw new BadRequestException('guestId is required for staff-created bookings');
			}
			return currentMember._id;
		}

		if (currentMember.memberType === MemberType.USER && targetGuestId !== currentMember._id) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const targetGuest = await this.memberModel.findById(targetGuestId).select('memberType memberStatus').exec();
		if (!targetGuest) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (targetGuest.memberStatus !== MemberStatus.ACTIVE) {
			throw new BadRequestException('Target guest account must be ACTIVE');
		}

		if (isStaff && targetGuest.memberType !== MemberType.USER) {
			throw new BadRequestException('Staff can only create bookings for USER accounts');
		}

		return targetGuestId;
	}

	private async resolveEffectiveRoomPrice(userId: string, room: RoomDocument): Promise<number> {
		const { price } = await this.priceLockService.getEffectivePrice(userId, String(room._id));
		return price;
	}

	private async executeBookingCancellation(
		currentMember: MemberJwtPayload,
		booking: BookingDocument,
		reason: string,
		refundAmount: number,
		cancellationFlow: CancellationFlow,
		evidencePhotos?: string[],
	): Promise<BookingDto> {
		const cancellationReason = reason.trim();
		if (!cancellationReason) {
			throw new BadRequestException('Cancellation reason is required');
		}
		if (cancellationReason.length < 5 || cancellationReason.length > 500) {
			throw new BadRequestException('Cancellation reason must be between 5 and 500 characters');
		}
		const sanitizedEvidence = this.sanitizeCancellationEvidence(evidencePhotos);
		this.ensureBookingIsCancellable(booking.bookingStatus);

		const session = await this.bookingModel.db.startSession();
		let updatedBooking: BookingDocument | null = null;

		try {
			await session.withTransaction(async () => {
				const txBooking = await this.bookingModel.findById(booking._id).session(session).exec();
				if (!txBooking) {
					throw new NotFoundException(Messages.NO_DATA_FOUND);
				}

				this.ensureBookingIsCancellable(txBooking.bookingStatus);

				for (const room of txBooking.rooms) {
					await this.roomInventoryService.releaseInventory({
						roomId: room.roomId.toString(),
						checkInDate: txBooking.checkInDate,
						checkOutDate: txBooking.checkOutDate,
						quantity: room.quantity,
						session,
					});
				}

				const cancellationDate = new Date();
				const paymentStatusAfterCancel = refundAmount > 0 ? PaymentStatus.REFUNDED : txBooking.paymentStatus;
				const updateData: Record<string, unknown> = {
					bookingStatus: BookingStatus.CANCELLED,
					cancellationDate,
					cancellationReason,
					cancellationFlow,
					cancelledByMemberId: currentMember._id,
					cancelledByMemberType: currentMember.memberType,
					refundAmount,
					paymentStatus: paymentStatusAfterCancel,
					refundDate: refundAmount > 0 ? cancellationDate : null,
					refundReason: refundAmount > 0 ? cancellationReason : null,
					refundEvidence: sanitizedEvidence.length > 0 ? sanitizedEvidence : null,
				};

				updatedBooking = await this.bookingModel
					.findOneAndUpdate(
						{
							_id: txBooking._id,
							bookingStatus: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
						},
						updateData,
						{ returnDocument: 'after', session },
					)
					.exec();
				if (!updatedBooking) {
					throw new BadRequestException('Booking was already cancelled or no longer cancellable');
				}
			});
		} finally {
			await session.endSession();
		}

		if (!updatedBooking) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		this.notificationService
			.notifyAdmins(
				NotificationType.BOOKING_CANCELLED,
				'Booking Cancelled',
				`Booking ${booking.bookingCode} was cancelled by ${cancellationFlow.toLowerCase()}`,
				`/admin/bookings/${booking._id.toString()}`,
			)
			.catch(() => {});

		// Notify the guest about cancellation (fire-and-forget)
		this.notificationService
			.createAndPush(
				{
					userId: String(booking.guestId),
					type: NotificationType.BOOKING_CANCELLED,
					title: 'Booking Cancelled',
					message:
						refundAmount > 0
							? `Booking ${booking.bookingCode} was cancelled. Refund: ₩${refundAmount.toLocaleString()}.`
							: `Booking ${booking.bookingCode} was cancelled.`,
					link: `/bookings`,
				},
				'BOOKING',
			)
			.catch(() => {});

		// Notify hotel agent about cancellation (fire-and-forget)
		const cancelHotel = await this.hotelModel.findById(booking.hotelId).select('memberId hotelTitle').exec();
		if (cancelHotel?.memberId && String(cancelHotel.memberId) !== currentMember._id) {
			this.notificationService
				.createAndPush(
					{
						userId: String(cancelHotel.memberId),
						type: NotificationType.BOOKING_CANCELLED,
						title: 'Booking Cancelled',
						message: `Booking ${booking.bookingCode} for ${cancelHotel.hotelTitle ?? 'your hotel'} was cancelled.`,
						link: `/bookings`,
					},
					'BOOKING',
				)
				.catch(() => {});
		}

		return toBookingDto(updatedBooking);
	}

	private bookingStatusMessage(status: BookingStatus, bookingCode: string): string {
		const messages: Partial<Record<BookingStatus, string>> = {
			[BookingStatus.CONFIRMED]: `Your booking ${bookingCode} has been confirmed!`,
			[BookingStatus.CHECKED_IN]: `Check-in for booking ${bookingCode} successful. Enjoy your stay!`,
			[BookingStatus.CHECKED_OUT]: `Thank you for staying with us! Booking ${bookingCode} is now checked out.`,
			[BookingStatus.NO_SHOW]: `Booking ${bookingCode} was marked as no-show.`,
		};
		return messages[status] ?? `Booking ${bookingCode} status updated to ${status}.`;
	}

	private ensureBookingIsCancellable(status: BookingStatus): void {
		if (status !== BookingStatus.PENDING && status !== BookingStatus.CONFIRMED) {
			throw new BadRequestException('Only pending or confirmed bookings can be cancelled');
		}
	}

	private ensureGuestCancellationBeforeCheckIn(booking: BookingDocument): void {
		const checkInDate = new Date(booking.checkInDate);
		if (checkInDate.getTime() <= Date.now()) {
			throw new BadRequestException('Guest cancellation is only allowed before check-in time');
		}
	}

	private normalizeToUtcDay(date: Date): Date {
		return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
	}

	/**
	 * Guest cancellation policy by hotel:
	 * - FLEXIBLE: >= 1 day => 100%, same day => 50%
	 * - MODERATE: > 7 days => 100%, 3-7 days => 50%, < 3 days => 0%
	 * - STRICT: > 14 days => 100%, 7-14 days => 50%, < 7 days => 0%
	 */
	private calculateGuestRefundAmount(booking: BookingDocument, policy: CancellationPolicy): number {
		if (booking.paymentStatus !== PaymentStatus.PAID && booking.paymentStatus !== PaymentStatus.PARTIAL) {
			return 0;
		}

		const now = new Date();
		const checkInDate = new Date(booking.checkInDate);
		const daysUntilCheckIn = Math.ceil((checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (policy === CancellationPolicy.FLEXIBLE) {
			if (daysUntilCheckIn >= 1) {
				return booking.paidAmount;
			}
			return Math.round(booking.paidAmount * 0.5);
		}

		if (policy === CancellationPolicy.STRICT) {
			if (daysUntilCheckIn > 14) {
				return booking.paidAmount;
			}
			if (daysUntilCheckIn >= 7) {
				return Math.round(booking.paidAmount * 0.5);
			}
			return 0;
		}

		if (daysUntilCheckIn > 7) {
			return booking.paidAmount;
		}

		if (daysUntilCheckIn >= 3) {
			return Math.round(booking.paidAmount * 0.5);
		}

		return 0;
	}

	/**
	 * Operator cancellation policy:
	 * - Refund all paid money for service-level operational cancellations.
	 */
	private calculateOperatorRefundAmount(booking: BookingDocument): number {
		if (booking.paymentStatus === PaymentStatus.PAID || booking.paymentStatus === PaymentStatus.PARTIAL) {
			return booking.paidAmount;
		}
		return 0;
	}

	private sanitizeCancellationEvidence(evidencePhotos?: string[]): string[] {
		if (!evidencePhotos || evidencePhotos.length === 0) {
			return [];
		}

		const sanitized = evidencePhotos.map((photo) => photo.trim()).filter((photo) => photo.length > 0);
		if (sanitized.length > 10) {
			throw new BadRequestException('A maximum of 10 evidence photos can be attached');
		}
		return sanitized;
	}
}
