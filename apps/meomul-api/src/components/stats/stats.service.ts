import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DashboardStatsDto } from '../../libs/dto/stats/stats';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { BookingStatus, PaymentStatus } from '../../libs/enums/booking.enum';
import { ChatStatus } from '../../libs/enums/common.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import type { MemberDocument } from '../../libs/types/member';
import type { HotelDocument } from '../../libs/types/hotel';
import type { RoomDocument } from '../../libs/types/room';
import type { BookingDocument } from '../../libs/types/booking';
import type { ReviewDocument } from '../../libs/types/review';
import type { ChatDocument } from '../../libs/types/chat';
import type { NotificationDocument } from '../../libs/types/notification';

interface BookingStatsAggregation {
	total: number;
	newToday: number;
	checkInsToday: number;
	checkOutsToday: number;
	pending: number;
	confirmed: number;
	totalRevenue: number;
	todayRevenue: number;
}

interface HotelStatsAggregation {
	total: number;
	pending: number;
	active: number;
}

interface MemberStatsAggregation {
	total: number;
	newToday: number;
}

interface ReviewStatsAggregation {
	total: number;
	newToday: number;
}

interface RoomStatsAggregation {
	total: number;
	available: number;
	maintenance: number;
}

interface ChatStatsAggregation {
	total: number;
	waiting: number;
	active: number;
}

interface NotificationStatsAggregation {
	total: number;
	unread: number;
}

@Injectable()
export class StatsService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Review') private readonly reviewModel: Model<ReviewDocument>,
		@InjectModel('Chat') private readonly chatModel: Model<ChatDocument>,
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>,
	) {}

	public async getDashboardStats(): Promise<DashboardStatsDto> {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const endOfToday = new Date(startOfToday.getTime() + 86400000);

		// 5 parallel queries (1 per collection), each using single-pass $group + $cond
		const [bookingStats, hotelStats, memberStats, reviewStats, roomStats, chatStats, notificationStats] =
			await Promise.all([
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
												$and: [{ $eq: ['$paymentStatus', PaymentStatus.PAID] }, { $gte: ['$paidAt', startOfToday] }],
											},
											'$paidAmount',
											0,
										],
									},
								},
							},
						},
					])
					.exec() as Promise<BookingStatsAggregation[]>,

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
					.exec() as Promise<HotelStatsAggregation[]>,

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
					.exec() as Promise<MemberStatsAggregation[]>,

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
					.exec() as Promise<ReviewStatsAggregation[]>,

				// Room: status breakdown in single-pass aggregation
				this.roomModel
					.aggregate([
						{
							$group: {
								_id: null,
								total: { $sum: 1 },
								available: {
									$sum: { $cond: [{ $eq: ['$roomStatus', RoomStatus.AVAILABLE] }, 1, 0] },
								},
								maintenance: {
									$sum: { $cond: [{ $eq: ['$roomStatus', RoomStatus.MAINTENANCE] }, 1, 0] },
								},
							},
						},
					])
					.exec() as Promise<RoomStatsAggregation[]>,

				// Chat: 3 metrics in single-pass aggregation
				this.chatModel
					.aggregate([
						{
							$group: {
								_id: null,
								total: { $sum: 1 },
								waiting: {
									$sum: { $cond: [{ $eq: ['$chatStatus', ChatStatus.WAITING] }, 1, 0] },
								},
								active: {
									$sum: { $cond: [{ $eq: ['$chatStatus', ChatStatus.ACTIVE] }, 1, 0] },
								},
							},
						},
					])
					.exec() as Promise<ChatStatsAggregation[]>,

				// Notification: 2 metrics in single-pass aggregation
				this.notificationModel
					.aggregate([
						{
							$group: {
								_id: null,
								total: { $sum: 1 },
								unread: {
									$sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] },
								},
							},
						},
					])
					.exec() as Promise<NotificationStatsAggregation[]>,
			]);

		const b: BookingStatsAggregation = bookingStats[0] ?? {
			total: 0,
			newToday: 0,
			checkInsToday: 0,
			checkOutsToday: 0,
			pending: 0,
			confirmed: 0,
			totalRevenue: 0,
			todayRevenue: 0,
		};
		const h: HotelStatsAggregation = hotelStats[0] ?? { total: 0, pending: 0, active: 0 };
		const m: MemberStatsAggregation = memberStats[0] ?? { total: 0, newToday: 0 };
		const r: ReviewStatsAggregation = reviewStats[0] ?? { total: 0, newToday: 0 };
		const rm: RoomStatsAggregation = roomStats[0] ?? { total: 0, available: 0, maintenance: 0 };
		const c: ChatStatsAggregation = chatStats[0] ?? { total: 0, waiting: 0, active: 0 };
		const n: NotificationStatsAggregation = notificationStats[0] ?? { total: 0, unread: 0 };

		return {
			totalMembers: m.total,
			totalHotels: h.total,
			totalRooms: rm.total,
			totalBookings: b.total,
			totalReviews: r.total,
			newBookingsToday: b.newToday,
			checkInsToday: b.checkInsToday,
			checkOutsToday: b.checkOutsToday,
			newReviewsToday: r.newToday,
			newMembersToday: m.newToday,
			pendingHotels: h.pending,
			activeHotels: h.active,
			pendingBookings: b.pending,
			confirmedBookings: b.confirmed,
			totalRevenue: b.totalRevenue,
			todayRevenue: b.todayRevenue,
			totalChats: c.total,
			waitingChats: c.waiting,
			activeChats: c.active,
			availableRooms: rm.available,
			maintenanceRooms: rm.maintenance,
			totalNotifications: n.total,
			unreadNotifications: n.unread,
		};
	}
}
