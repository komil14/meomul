import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { BookingDto } from '../../libs/dto/booking/booking';
import { BookingInput } from '../../libs/dto/booking/booking.input';
import { BookingsDto } from '../../libs/dto/common/bookings';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { BookingStatus, PaymentStatus } from '../../libs/enums/booking.enum';
import { BookingService } from './booking.service';

@Resolver()
export class BookingResolver {
	private readonly logger = new Logger(BookingResolver.name);

	constructor(private readonly bookingService: BookingService) {}

	/**
	 * Get all bookings (ADMIN only)
	 */
	@Query(() => BookingsDto)
	@Roles(MemberType.ADMIN)
	public async getAllBookingsAdmin(
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => BookingStatus, nullable: true }) statusFilter?: BookingStatus,
	): Promise<BookingsDto> {
		try {
			this.logger.log('Query getAllBookingsAdmin', statusFilter ?? 'all');
			return this.bookingService.getAllBookingsAdmin(input, statusFilter);
		} catch (error) {
			this.logger.error('Query getAllBookingsAdmin failed', error);
			throw error;
		}
	}

	/**
	 * Create a new booking (authenticated users)
	 */
	@Mutation(() => BookingDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async createBooking(
		@CurrentMember() currentMember: any,
		@Args('input') input: BookingInput,
	): Promise<BookingDto> {
		try {
			this.logger.log('Mutation createBooking', currentMember?._id ?? 'unknown', input.hotelId);
			return this.bookingService.createBooking(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation createBooking failed', currentMember?._id ?? 'unknown', input.hotelId, error);
			throw error;
		}
	}

	/**
	 * Get single booking by ID
	 */
	@Query(() => BookingDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getBooking(
		@CurrentMember() currentMember: any,
		@Args('bookingId') bookingId: string,
	): Promise<BookingDto> {
		try {
			this.logger.log('Query getBooking', currentMember?._id ?? 'unknown', bookingId);
			return this.bookingService.getBooking(currentMember, bookingId);
		} catch (error) {
			this.logger.error('Query getBooking failed', currentMember?._id ?? 'unknown', bookingId, error);
			throw error;
		}
	}

	/**
	 * Get user's bookings
	 */
	@Query(() => BookingsDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyBookings(
		@CurrentMember() currentMember: any,
		@Args('input') input: PaginationInput,
	): Promise<BookingsDto> {
		try {
			this.logger.log('Query getMyBookings', currentMember?._id ?? 'unknown', input.page);
			return this.bookingService.getMyBookings(currentMember, input);
		} catch (error) {
			this.logger.error('Query getMyBookings failed', currentMember?._id ?? 'unknown', input.page, error);
			throw error;
		}
	}

	/**
	 * Get agent's hotel bookings
	 */
	@Query(() => BookingsDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async getAgentBookings(
		@CurrentMember() currentMember: any,
		@Args('hotelId') hotelId: string,
		@Args('input') input: PaginationInput,
	): Promise<BookingsDto> {
		try {
			this.logger.log('Query getAgentBookings', currentMember?._id ?? 'unknown', hotelId);
			return this.bookingService.getAgentBookings(currentMember, hotelId, input);
		} catch (error) {
			this.logger.error('Query getAgentBookings failed', currentMember?._id ?? 'unknown', hotelId, error);
			throw error;
		}
	}

	/**
	 * Update booking status (AGENT/ADMIN only)
	 */
	@Mutation(() => BookingDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async updateBookingStatus(
		@CurrentMember() currentMember: any,
		@Args('bookingId') bookingId: string,
		@Args('status', { type: () => BookingStatus }) status: BookingStatus,
	): Promise<BookingDto> {
		try {
			this.logger.log('Mutation updateBookingStatus', currentMember?._id ?? 'unknown', bookingId, status);
			return this.bookingService.updateBookingStatus(currentMember, bookingId, status);
		} catch (error) {
			this.logger.error('Mutation updateBookingStatus failed', currentMember?._id ?? 'unknown', bookingId, error);
			throw error;
		}
	}

	/**
	 * Cancel booking with refund
	 */
	@Mutation(() => BookingDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async cancelBooking(
		@CurrentMember() currentMember: any,
		@Args('bookingId') bookingId: string,
		@Args('reason') reason: string,
	): Promise<BookingDto> {
		try {
			this.logger.log('Mutation cancelBooking', currentMember?._id ?? 'unknown', bookingId);
			return this.bookingService.cancelBooking(currentMember, bookingId, reason);
		} catch (error) {
			this.logger.error('Mutation cancelBooking failed', currentMember?._id ?? 'unknown', bookingId, error);
			throw error;
		}
	}

	/**
	 * Update payment status (AGENT/ADMIN only)
	 */
	@Mutation(() => BookingDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async updatePaymentStatus(
		@CurrentMember() currentMember: any,
		@Args('bookingId') bookingId: string,
		@Args('paymentStatus', { type: () => PaymentStatus }) paymentStatus: PaymentStatus,
		@Args('paidAmount') paidAmount: number,
	): Promise<BookingDto> {
		try {
			this.logger.log('Mutation updatePaymentStatus', currentMember?._id ?? 'unknown', bookingId, paymentStatus);
			return this.bookingService.updatePaymentStatus(currentMember, bookingId, paymentStatus, paidAmount);
		} catch (error) {
			this.logger.error('Mutation updatePaymentStatus failed', currentMember?._id ?? 'unknown', bookingId, error);
			throw error;
		}
	}
}
