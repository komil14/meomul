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

		// 5 parallel queries (1 per collection), each using single-pass $group + $cond
		const [bookingStats, hotelStats, memberStats, reviewStats, totalRooms] = await Promise.all([
			// Booking: 8 metrics in 1 single-pass aggregation
			this.bookingModel
				.aggregate([
					{
						$group: {
							_id: null,
							total: { $sum: 1 },
							newToday: {
								$sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] },
							},
							checkInsToday: {
								$sum: {
									$cond: [
										{
											$and: [
												{ $gte: ['$checkInDate', startOfToday] },
												{ $lt: ['$checkInDate', endOfToday] },
												{
													$in: ['$bookingStatus', [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]],
												},
											],
										},
										1,
										0,
									],
								},
							},
							checkOutsToday: {
								$sum: {
									$cond: [
										{
											$and: [
												{ $gte: ['$checkOutDate', startOfToday] },
												{ $lt: ['$checkOutDate', endOfToday] },
												{ $eq: ['$bookingStatus', BookingStatus.CHECKED_OUT] },
											],
										},
										1,
										0,
									],
								},
							},
							pending: {
								$sum: { $cond: [{ $eq: ['$bookingStatus', BookingStatus.PENDING] }, 1, 0] },
							},
							confirmed: {
								$sum: { $cond: [{ $eq: ['$bookingStatus', BookingStatus.CONFIRMED] }, 1, 0] },
							},
							totalRevenue: {
								$sum: {
									$cond: [{ $eq: ['$paymentStatus', PaymentStatus.PAID] }, '$paidAmount', 0],
								},
							},
							todayRevenue: {
								$sum: {
									$cond: [
										{
											$and: [
												{ $eq: ['$paymentStatus', PaymentStatus.PAID] },
												{ $gte: ['$paidAt', startOfToday] },
											],
										},
										'$paidAmount',
										0,
									],
								},
							},
						},
					},
				])
				.exec(),

			// Hotel: 3 metrics in 1 single-pass aggregation
			this.hotelModel
				.aggregate([
					{
						$group: {
							_id: null,
							total: {
								$sum: { $cond: [{ $ne: ['$hotelStatus', HotelStatus.DELETE] }, 1, 0] },
							},
							pending: {
								$sum: { $cond: [{ $eq: ['$hotelStatus', HotelStatus.PENDING] }, 1, 0] },
							},
							active: {
								$sum: { $cond: [{ $eq: ['$hotelStatus', HotelStatus.ACTIVE] }, 1, 0] },
							},
						},
					},
				])
				.exec(),

			// Member: 2 metrics in 1 single-pass aggregation
			this.memberModel
				.aggregate([
					{
						$group: {
							_id: null,
							total: { $sum: 1 },
							newToday: {
								$sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] },
							},
						},
					},
				])
				.exec(),

			// Review: 2 metrics in 1 single-pass aggregation
			this.reviewModel
				.aggregate([
					{
						$group: {
							_id: null,
							total: { $sum: 1 },
							newToday: {
								$sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] },
							},
						},
					},
				])
				.exec(),

			// Room: single count
			this.roomModel.countDocuments().exec(),
		]);

		const b = bookingStats[0] ?? {};
		const h = hotelStats[0] ?? {};
		const m = memberStats[0] ?? {};
		const r = reviewStats[0] ?? {};

		return {
			totalMembers: m.total ?? 0,
			totalHotels: h.total ?? 0,
			totalRooms,
			totalBookings: b.total ?? 0,
			totalReviews: r.total ?? 0,
			newBookingsToday: b.newToday ?? 0,
			checkInsToday: b.checkInsToday ?? 0,
			checkOutsToday: b.checkOutsToday ?? 0,
			newReviewsToday: r.newToday ?? 0,
			newMembersToday: m.newToday ?? 0,
			pendingHotels: h.pending ?? 0,
			activeHotels: h.active ?? 0,
			pendingBookings: b.pending ?? 0,
			confirmedBookings: b.confirmed ?? 0,
			totalRevenue: b.totalRevenue ?? 0,
			todayRevenue: b.todayRevenue ?? 0,
		};
	}
}
