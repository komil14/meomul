import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { BookingStatus, PaymentStatus } from '../../../meomul-api/src/libs/enums/booking.enum';
import { NotificationType } from '../../../meomul-api/src/libs/enums/common.enum';
import type { BookingDocument } from '../../../meomul-api/src/libs/types/booking';
import type { RoomDocument } from '../../../meomul-api/src/libs/types/room';
import type { NotificationDocument } from '../../../meomul-api/src/libs/types/notification';

@Injectable()
export class BookingService {
	private readonly logger = new Logger(BookingService.name);

	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>,
	) {}

	/**
	 * Send check-in reminder notifications for today's confirmed bookings.
	 * Runs daily at 8:00 AM.
	 */
	@Cron('0 8 * * *')
	public async checkInReminder(): Promise<void> {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const endOfToday = new Date(startOfToday.getTime() + 86400000);

		const bookings = await this.bookingModel
			.find({
				bookingStatus: BookingStatus.CONFIRMED,
				checkInDate: { $gte: startOfToday, $lt: endOfToday },
			})
			.exec();

		if (bookings.length === 0) return;

		const notifications = bookings.map((booking) => ({
			userId: booking.guestId,
			type: NotificationType.BOOKING_REMINDER,
			title: 'Check-in Today',
			message: `Your check-in is today! Booking code: ${booking.bookingCode}`,
			link: `/bookings/${String(booking._id)}`,
			read: false,
		}));

		await this.notificationModel.insertMany(notifications);
		this.logger.log(`Sent ${notifications.length} check-in reminder(s)`);
	}

	/**
	 * Mark no-show bookings (confirmed but check-in date has passed).
	 * Restores room availability.
	 * Runs daily at 11:00 PM.
	 */
	@Cron('0 23 * * *')
	public async markNoShows(): Promise<void> {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);

		const bookings = await this.bookingModel
			.find({
				bookingStatus: BookingStatus.CONFIRMED,
				checkInDate: { $lt: startOfToday },
			})
			.exec();

		if (bookings.length === 0) return;

		for (const booking of bookings) {
			// Mark as no-show
			await this.bookingModel
				.findByIdAndUpdate(booking._id, { bookingStatus: BookingStatus.NO_SHOW })
				.exec();

			// Restore room availability
			for (const room of booking.rooms) {
				await this.roomModel
					.findByIdAndUpdate(room.roomId, { $inc: { availableRooms: room.quantity } })
					.exec();
			}
		}

		this.logger.log(`Marked ${bookings.length} booking(s) as NO_SHOW`);
	}

	/**
	 * Send review request notifications for yesterday's checkouts.
	 * Runs daily at 10:00 AM.
	 */
	@Cron('0 10 * * *')
	public async reviewRequest(): Promise<void> {
		const startOfYesterday = new Date();
		startOfYesterday.setDate(startOfYesterday.getDate() - 1);
		startOfYesterday.setHours(0, 0, 0, 0);
		const endOfYesterday = new Date(startOfYesterday.getTime() + 86400000);

		const bookings = await this.bookingModel
			.find({
				bookingStatus: BookingStatus.CHECKED_OUT,
				checkOutDate: { $gte: startOfYesterday, $lt: endOfYesterday },
			})
			.exec();

		if (bookings.length === 0) return;

		// Check which guests already received a review request for these bookings
		const bookingIds = bookings.map((b) => String(b._id));
		const existingNotifications = await this.notificationModel
			.find({
				type: NotificationType.REVIEW_REQUEST,
				link: { $in: bookingIds.map((id) => `/bookings/${id}`) },
			})
			.select('link')
			.exec();

		const notifiedLinks = new Set(existingNotifications.map((n) => n.link));

		const notifications = bookings
			.filter((booking) => !notifiedLinks.has(`/bookings/${String(booking._id)}`))
			.map((booking) => ({
				userId: booking.guestId,
				type: NotificationType.REVIEW_REQUEST,
				title: 'How Was Your Stay?',
				message: 'Leave a review and help other travelers!',
				link: `/bookings/${String(booking._id)}`,
				read: false,
			}));

		if (notifications.length > 0) {
			await this.notificationModel.insertMany(notifications);
			this.logger.log(`Sent ${notifications.length} review request(s)`);
		}
	}

	/**
	 * Auto-confirm bookings that have been paid but are still PENDING.
	 * Runs every 15 minutes.
	 */
	@Cron('*/15 * * * *')
	public async autoConfirmPaidBookings(): Promise<void> {
		const result = await this.bookingModel
			.updateMany(
				{
					bookingStatus: BookingStatus.PENDING,
					paymentStatus: PaymentStatus.PAID,
				},
				{
					$set: { bookingStatus: BookingStatus.CONFIRMED },
				},
			)
			.exec();

		if (result.modifiedCount > 0) {
			this.logger.log(`Auto-confirmed ${result.modifiedCount} paid booking(s)`);
		}
	}
}
