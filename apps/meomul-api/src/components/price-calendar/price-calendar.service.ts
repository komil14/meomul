import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PriceCalendarInput } from '../../libs/dto/price-calendar/price-calendar.input';
import { PriceCalendarDto, DayPriceDto, CheapestDateDto } from '../../libs/dto/price-calendar/price-calendar';
import { DemandLevel } from '../../libs/enums/common.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/messages';
import type { RoomDocument } from '../../libs/types/room';
import type { BookingDocument } from '../../libs/types/booking';

@Injectable()
export class PriceCalendarService {
	constructor(
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
	) {}

	/**
	 * Generate a price calendar for a room showing daily prices, demand levels, and availability
	 */
	public async getPriceCalendar(input: PriceCalendarInput): Promise<PriceCalendarDto> {
		const room = await this.roomModel.findById(input.roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Determine the month to display
		const now = new Date();
		const targetMonth = input.month
			? new Date(`${input.month}-01T00:00:00`)
			: new Date(now.getFullYear(), now.getMonth(), 1);

		const year = targetMonth.getFullYear();
		const month = targetMonth.getMonth();
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		// Get start/end of month for booking query
		const monthStart = new Date(year, month, 1);
		const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

		// Count bookings per day for this room during the month
		const bookingsPerDay = await this.getBookingsPerDay(input.roomId, monthStart, monthEnd);

		// Build calendar
		const calendar: DayPriceDto[] = [];

		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			const dateStr = this.formatDate(date);
			const dayOfWeek = date.getDay();
			const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday, Saturday

			// Calculate booked rooms for this day
			const bookedRooms = bookingsPerDay.get(dateStr) || 0;
			const availableRooms = Math.max(0, room.totalRooms - bookedRooms);

			// Calculate demand level based on occupancy
			const occupancyRate = room.totalRooms > 0 ? bookedRooms / room.totalRooms : 0;
			const demandLevel = this.getDemandLevel(occupancyRate);

			// Calculate dynamic price
			const price = this.calculateDayPrice(room.basePrice, room.weekendSurcharge, isWeekend, demandLevel);

			calendar.push({
				date: dateStr,
				price,
				isWeekend,
				demandLevel,
				availableRooms,
			});
		}

		// Find cheapest and most expensive dates
		const cheapestDate = this.findCheapestDate(calendar);
		const mostExpensiveDate = this.findMostExpensiveDate(calendar);
		const averagePrice = Math.round(calendar.reduce((sum, d) => sum + d.price, 0) / calendar.length);
		const savings = mostExpensiveDate.price - cheapestDate.price;

		return {
			calendar,
			cheapestDate,
			mostExpensiveDate,
			averagePrice,
			savings,
		};
	}

	/**
	 * Count how many rooms are booked per day for a specific room type
	 */
	private async getBookingsPerDay(
		roomId: string,
		monthStart: Date,
		monthEnd: Date,
	): Promise<Map<string, number>> {
		const bookings = await this.bookingModel
			.find({
				'rooms.roomId': new Types.ObjectId(roomId),
				checkInDate: { $lte: monthEnd },
				checkOutDate: { $gte: monthStart },
				bookingStatus: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
			})
			.exec();

		const dayMap = new Map<string, number>();

		for (const booking of bookings) {
			const roomEntry = booking.rooms.find((r) => r.roomId.toString() === roomId);
			if (!roomEntry) continue;

			const checkIn = new Date(Math.max(booking.checkInDate.getTime(), monthStart.getTime()));
			const checkOut = new Date(Math.min(booking.checkOutDate.getTime(), monthEnd.getTime()));

			// Count each day the booking occupies
			const current = new Date(checkIn);
			while (current < checkOut) {
				const dateStr = this.formatDate(current);
				dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + roomEntry.quantity);
				current.setDate(current.getDate() + 1);
			}
		}

		return dayMap;
	}

	/**
	 * Determine demand level based on occupancy rate
	 */
	private getDemandLevel(occupancyRate: number): DemandLevel {
		if (occupancyRate >= 0.8) return DemandLevel.HIGH;
		if (occupancyRate >= 0.4) return DemandLevel.MEDIUM;
		return DemandLevel.LOW;
	}

	/**
	 * Calculate dynamic price for a specific day
	 */
	private calculateDayPrice(
		basePrice: number,
		weekendSurcharge: number,
		isWeekend: boolean,
		demandLevel: DemandLevel,
	): number {
		let price = basePrice;

		// Weekend surcharge
		if (isWeekend) {
			price += weekendSurcharge;
		}

		// Demand-based pricing adjustment
		switch (demandLevel) {
			case DemandLevel.HIGH:
				price = Math.round(price * 1.2); // +20% for high demand
				break;
			case DemandLevel.MEDIUM:
				price = Math.round(price * 1.05); // +5% for medium demand
				break;
			case DemandLevel.LOW:
				// No change for low demand
				break;
		}

		return price;
	}

	private findCheapestDate(calendar: DayPriceDto[]): CheapestDateDto {
		const cheapest = calendar.reduce((min, day) => (day.price < min.price ? day : min), calendar[0]);
		return { date: cheapest.date, price: cheapest.price };
	}

	private findMostExpensiveDate(calendar: DayPriceDto[]): CheapestDateDto {
		const expensive = calendar.reduce((max, day) => (day.price > max.price ? day : max), calendar[0]);
		return { date: expensive.date, price: expensive.price };
	}

	private formatDate(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
