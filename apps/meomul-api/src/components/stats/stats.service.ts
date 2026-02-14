import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DashboardStatsDto } from '../../libs/dto/stats/stats';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { BookingStatus, PaymentStatus } from '../../libs/enums/booking.enum';
import type { MemberDocument } from '../../libs/types/member';
import type { HotelDocument } from '../../libs/types/hotel';
import type { RoomDocument } from '../../libs/types/room';
import type { BookingDocument } from '../../libs/types/booking';
import type { ReviewDocument } from '../../libs/types/review';

@Injectable()
export class StatsService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Review') private readonly reviewModel: Model<ReviewDocument>,
	) {}

	public async getDashboardStats(): Promise<DashboardStatsDto> {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);

		const [
			totalMembers,
			totalHotels,
			totalRooms,
			totalBookings,
			totalReviews,
			newBookingsToday,
			checkInsToday,
			checkOutsToday,
			newReviewsToday,
			newMembersToday,
			pendingHotels,
			activeHotels,
			pendingBookings,
			confirmedBookings,
			totalRevenueResult,
			todayRevenueResult,
		] = await Promise.all([
			// Totals
			this.memberModel.countDocuments().exec(),
			this.hotelModel.countDocuments({ hotelStatus: { $ne: HotelStatus.DELETE } }).exec(),
			this.roomModel.countDocuments().exec(),
			this.bookingModel.countDocuments().exec(),
			this.reviewModel.countDocuments().exec(),

			// Today's activity
			this.bookingModel.countDocuments({ createdAt: { $gte: startOfToday } }).exec(),
			this.bookingModel.countDocuments({
				checkInDate: { $gte: startOfToday, $lt: new Date(startOfToday.getTime() + 86400000) },
				bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
			}).exec(),
			this.bookingModel.countDocuments({
				checkOutDate: { $gte: startOfToday, $lt: new Date(startOfToday.getTime() + 86400000) },
				bookingStatus: BookingStatus.CHECKED_OUT,
			}).exec(),
			this.reviewModel.countDocuments({ createdAt: { $gte: startOfToday } }).exec(),
			this.memberModel.countDocuments({ createdAt: { $gte: startOfToday } }).exec(),

			// Status breakdowns
			this.hotelModel.countDocuments({ hotelStatus: HotelStatus.PENDING }).exec(),
			this.hotelModel.countDocuments({ hotelStatus: HotelStatus.ACTIVE }).exec(),
			this.bookingModel.countDocuments({ bookingStatus: BookingStatus.PENDING }).exec(),
			this.bookingModel.countDocuments({ bookingStatus: BookingStatus.CONFIRMED }).exec(),

			// Revenue
			this.bookingModel.aggregate([
				{ $match: { paymentStatus: PaymentStatus.PAID } },
				{ $group: { _id: null, total: { $sum: '$paidAmount' } } },
			]).exec(),
			this.bookingModel.aggregate([
				{ $match: { paymentStatus: PaymentStatus.PAID, paidAt: { $gte: startOfToday } } },
				{ $group: { _id: null, total: { $sum: '$paidAmount' } } },
			]).exec(),
		]);

		return {
			totalMembers,
			totalHotels,
			totalRooms,
			totalBookings,
			totalReviews,
			newBookingsToday,
			checkInsToday,
			checkOutsToday,
			newReviewsToday,
			newMembersToday,
			pendingHotels,
			activeHotels,
			pendingBookings,
			confirmedBookings,
			totalRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0,
			todayRevenue: todayRevenueResult.length > 0 ? todayRevenueResult[0].total : 0,
		};
	}
}
