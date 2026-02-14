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
		const endOfToday = new Date(startOfToday.getTime() + 86400000);

		// 5 parallel queries (1 per collection) instead of 16 separate queries
		const [bookingStats, hotelStats, memberStats, reviewStats, totalRooms] = await Promise.all([
			// Booking: 8 metrics in 1 $facet query
			this.bookingModel.aggregate([
				{
					$facet: {
						total: [{ $count: 'count' }],
						newToday: [
							{ $match: { createdAt: { $gte: startOfToday } } },
							{ $count: 'count' },
						],
						checkInsToday: [
							{
								$match: {
									checkInDate: { $gte: startOfToday, $lt: endOfToday },
									bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
								},
							},
							{ $count: 'count' },
						],
						checkOutsToday: [
							{
								$match: {
									checkOutDate: { $gte: startOfToday, $lt: endOfToday },
									bookingStatus: BookingStatus.CHECKED_OUT,
								},
							},
							{ $count: 'count' },
						],
						pending: [
							{ $match: { bookingStatus: BookingStatus.PENDING } },
							{ $count: 'count' },
						],
						confirmed: [
							{ $match: { bookingStatus: BookingStatus.CONFIRMED } },
							{ $count: 'count' },
						],
						totalRevenue: [
							{ $match: { paymentStatus: PaymentStatus.PAID } },
							{ $group: { _id: null, sum: { $sum: '$paidAmount' } } },
						],
						todayRevenue: [
							{ $match: { paymentStatus: PaymentStatus.PAID, paidAt: { $gte: startOfToday } } },
							{ $group: { _id: null, sum: { $sum: '$paidAmount' } } },
						],
					},
				},
			]).exec(),

			// Hotel: 3 metrics in 1 $facet query
			this.hotelModel.aggregate([
				{
					$facet: {
						total: [
							{ $match: { hotelStatus: { $ne: HotelStatus.DELETE } } },
							{ $count: 'count' },
						],
						pending: [
							{ $match: { hotelStatus: HotelStatus.PENDING } },
							{ $count: 'count' },
						],
						active: [
							{ $match: { hotelStatus: HotelStatus.ACTIVE } },
							{ $count: 'count' },
						],
					},
				},
			]).exec(),

			// Member: 2 metrics in 1 $facet query
			this.memberModel.aggregate([
				{
					$facet: {
						total: [{ $count: 'count' }],
						newToday: [
							{ $match: { createdAt: { $gte: startOfToday } } },
							{ $count: 'count' },
						],
					},
				},
			]).exec(),

			// Review: 2 metrics in 1 $facet query
			this.reviewModel.aggregate([
				{
					$facet: {
						total: [{ $count: 'count' }],
						newToday: [
							{ $match: { createdAt: { $gte: startOfToday } } },
							{ $count: 'count' },
						],
					},
				},
			]).exec(),

			// Room: single count (no benefit from $facet)
			this.roomModel.countDocuments().exec(),
		]);

		return {
			totalMembers: this.facetCount(memberStats, 'total'),
			totalHotels: this.facetCount(hotelStats, 'total'),
			totalRooms,
			totalBookings: this.facetCount(bookingStats, 'total'),
			totalReviews: this.facetCount(reviewStats, 'total'),
			newBookingsToday: this.facetCount(bookingStats, 'newToday'),
			checkInsToday: this.facetCount(bookingStats, 'checkInsToday'),
			checkOutsToday: this.facetCount(bookingStats, 'checkOutsToday'),
			newReviewsToday: this.facetCount(reviewStats, 'newToday'),
			newMembersToday: this.facetCount(memberStats, 'newToday'),
			pendingHotels: this.facetCount(hotelStats, 'pending'),
			activeHotels: this.facetCount(hotelStats, 'active'),
			pendingBookings: this.facetCount(bookingStats, 'pending'),
			confirmedBookings: this.facetCount(bookingStats, 'confirmed'),
			totalRevenue: this.facetSum(bookingStats, 'totalRevenue'),
			todayRevenue: this.facetSum(bookingStats, 'todayRevenue'),
		};
	}

	private facetCount(facetResult: any[], key: string): number {
		return facetResult[0]?.[key]?.[0]?.count ?? 0;
	}

	private facetSum(facetResult: any[], key: string): number {
		return facetResult[0]?.[key]?.[0]?.sum ?? 0;
	}
}
