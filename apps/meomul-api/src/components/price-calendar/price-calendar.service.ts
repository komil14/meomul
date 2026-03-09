import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { PriceCalendarInput } from '../../libs/dto/price-calendar/price-calendar.input';
import { PriceCalendarDto, DayPriceDto, CheapestDateDto } from '../../libs/dto/price-calendar/price-calendar';
import { DemandLevel } from '../../libs/enums/common.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import { Messages } from '../../libs/messages';
import type { RoomDocument } from '../../libs/types/room';
import type { HotelDocument } from '../../libs/types/hotel';
import type { RoomInventoryDocument } from '../../libs/types/room-inventory';
import { RoomInventoryService } from '../room-inventory/room-inventory.service';

@Injectable()
export class PriceCalendarService {
	constructor(
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('RoomInventory') private readonly roomInventoryModel: Model<RoomInventoryDocument>,
		private readonly roomInventoryService: RoomInventoryService,
	) {}

	/**
	 * Generate a price calendar for a room showing daily prices, demand levels, and availability.
	 * Source of truth: RoomInventory (per-day rows).
	 */
	public async getPriceCalendar(input: PriceCalendarInput): Promise<PriceCalendarDto> {
		const room = await this.roomModel.findById(input.roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		await this.assertRoomIsPubliclyVisible(room);

		const { year, month } = this.resolveTargetMonth(input.month);
		const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
		const monthEnd = new Date(Date.UTC(year, month, daysInMonth, 0, 0, 0, 0));

		// Ensure month rows exist before calendar render.
		await this.roomInventoryService.seedRoomInventory({
			roomId: input.roomId,
			totalRooms: room.totalRooms,
			basePrice: room.basePrice,
			startDate: monthStart,
			days: daysInMonth,
		});

		const inventoryRows = await this.roomInventoryModel
			.find({
				roomId: room._id,
				date: { $gte: monthStart, $lte: monthEnd },
			})
			.sort({ date: 1 })
			.exec();

		const inventoryByDate = new Map<string, RoomInventoryDocument>();
		for (const row of inventoryRows) {
			inventoryByDate.set(this.formatDate(row.date), row);
		}

		const calendar: DayPriceDto[] = [];
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
			const dateStr = this.formatDate(date);
			const dayOfWeek = date.getUTCDay();
			const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday, Saturday

			const row = inventoryByDate.get(dateStr);
			const totalRooms = row?.total ?? room.totalRooms;
			const bookedRooms = row?.booked ?? 0;
			const isClosed = row?.closed ?? false;
			const availableRooms = isClosed ? 0 : Math.max(0, totalRooms - bookedRooms);
			const occupancyRate = totalRooms > 0 ? (totalRooms - availableRooms) / totalRooms : 0;
			const demandLevel = isClosed ? DemandLevel.HIGH : this.getDemandLevel(occupancyRate);

			const basePriceForDay = row?.overridePrice ?? row?.basePrice ?? room.basePrice;
			const price = this.calculateDayPrice(basePriceForDay, room.weekendSurcharge, isWeekend, demandLevel);

			calendar.push({
				date: dateStr,
				price,
				isWeekend,
				demandLevel,
				localEvent: isClosed ? 'Closed' : undefined,
				availableRooms,
			});
		}

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

	private resolveTargetMonth(monthInput?: string): { year: number; month: number } {
		if (monthInput) {
			const [yearPart, monthPart] = monthInput.split('-');
			const parsedYear = Number(yearPart);
			const parsedMonth = Number(monthPart);
			if (Number.isInteger(parsedYear) && Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
				return { year: parsedYear, month: parsedMonth - 1 };
			}
		}

		const now = new Date();
		return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
	}

	private formatDate(date: Date): string {
		const y = date.getUTCFullYear();
		const m = String(date.getUTCMonth() + 1).padStart(2, '0');
		const d = String(date.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	private async assertRoomIsPubliclyVisible(room: Pick<RoomDocument, 'hotelId' | 'roomStatus'>): Promise<void> {
		if (room.roomStatus && room.roomStatus !== RoomStatus.AVAILABLE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const hotel = await this.hotelModel.findById(room.hotelId).select('hotelStatus').lean().exec();
		if (!hotel || hotel.hotelStatus !== HotelStatus.ACTIVE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
	}
}
