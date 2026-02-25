import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import type {
	RoomInventoryDocument,
	ReserveInventoryInput,
	SeedRoomInventoryInput,
	SyncFutureInventoryDefaultsInput,
} from '../../libs/types/room-inventory';
import { toRoomInventoryDto } from '../../libs/types/room-inventory';

@Injectable()
export class RoomInventoryService {
	constructor(@InjectModel('RoomInventory') private readonly roomInventoryModel: Model<RoomInventoryDocument>) {}

	public async seedRoomInventory(input: SeedRoomInventoryInput): Promise<number> {
		if (input.days <= 0) {
			throw new BadRequestException('days must be greater than 0');
		}
		if (input.totalRooms < 0) {
			throw new BadRequestException('totalRooms must be 0 or greater');
		}

		const dates = this.buildDateWindow(input.startDate, input.days);
		if (dates.length === 0) {
			return 0;
		}
		const roomObjectId = this.toObjectId(input.roomId);
		const operations = dates.map((date) => ({
			updateOne: {
				filter: {
					roomId: roomObjectId,
					date,
				},
				update: {
					$setOnInsert: {
						roomId: roomObjectId,
						date,
						total: input.totalRooms,
						booked: 0,
						closed: false,
						...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
					},
				},
				upsert: true,
			},
		}));

		const result = await this.roomInventoryModel.bulkWrite(operations, {
			ordered: false,
			...(input.session ? { session: input.session } : {}),
		});

		return result.upsertedCount;
	}

	public async reserveInventory(input: ReserveInventoryInput): Promise<void> {
		this.assertValidReserveInput(input);
		const roomObjectId = this.toObjectId(input.roomId);
		await this.ensureInventoryExists(roomObjectId, input.checkInDate, input.checkOutDate, input.session);

		const dates = this.buildStayDates(input.checkInDate, input.checkOutDate);
		const reservedDates: Date[] = [];

		for (const date of dates) {
			const result = await this.roomInventoryModel
				.updateOne(
					{
						roomId: roomObjectId,
						date,
						closed: false,
						$expr: {
							$gte: [{ $subtract: ['$total', '$booked'] }, input.quantity],
						},
					},
					{
						$inc: {
							booked: input.quantity,
						},
					},
					input.session ? { session: input.session } : undefined,
				)
				.exec();

			if (result.modifiedCount === 0) {
				if (!input.session && reservedDates.length > 0) {
					await this.roomInventoryModel
						.updateMany(
							{
								roomId: roomObjectId,
								date: { $in: reservedDates },
								booked: { $gte: input.quantity },
							},
							{
								$inc: { booked: -input.quantity },
							},
						)
						.exec();
				}

				throw new BadRequestException('Room inventory is not available for one or more requested nights');
			}

			reservedDates.push(date);
		}
	}

	public async releaseInventory(input: ReserveInventoryInput): Promise<void> {
		this.assertValidReserveInput(input);
		const roomObjectId = this.toObjectId(input.roomId);
		const dates = this.buildStayDates(input.checkInDate, input.checkOutDate);

		for (const date of dates) {
			const result = await this.roomInventoryModel
				.updateOne(
					{
						roomId: roomObjectId,
						date,
						booked: { $gte: input.quantity },
					},
					{
						$inc: {
							booked: -input.quantity,
						},
					},
					input.session ? { session: input.session } : undefined,
				)
				.exec();

			if (result.modifiedCount === 0) {
				throw new BadRequestException('Failed to release inventory because one or more daily rows are missing');
			}
		}
	}

	public async getInventoryWindow(roomId: string, checkInDate: Date, checkOutDate: Date) {
		const roomObjectId = this.toObjectId(roomId);
		const dates = this.buildStayDates(checkInDate, checkOutDate);
		const list = await this.roomInventoryModel
			.find({
				roomId: roomObjectId,
				date: { $in: dates },
			})
			.sort({ date: 1 })
			.exec();

		return list.map(toRoomInventoryDto);
	}

	/**
	 * Sync future inventory defaults after room configuration updates.
	 * - basePrice: updates all future rows
	 * - totalRooms: updates future rows where booked <= totalRooms
	 *   and safely clamps overbooked rows total to booked
	 */
	public async syncFutureInventoryDefaults(input: SyncFutureInventoryDefaultsInput): Promise<void> {
		if (input.totalRooms === undefined && input.basePrice === undefined) {
			return;
		}
		if (input.totalRooms !== undefined && input.totalRooms < 0) {
			throw new BadRequestException('totalRooms must be 0 or greater');
		}
		if (input.basePrice !== undefined && input.basePrice < 0) {
			throw new BadRequestException('basePrice must be 0 or greater');
		}

		const roomObjectId = this.toObjectId(input.roomId);
		const startDate = this.normalizeToUtcDay(input.startDate ?? new Date());
		const sessionOptions = input.session ? { session: input.session } : undefined;

		if (input.totalRooms !== undefined) {
			const setPayload: Record<string, number> = { total: input.totalRooms };
			if (input.basePrice !== undefined) {
				setPayload.basePrice = input.basePrice;
			}

			await this.roomInventoryModel
				.updateMany(
					{
						roomId: roomObjectId,
						date: { $gte: startDate },
						booked: { $lte: input.totalRooms },
					},
					{
						$set: setPayload,
					},
					sessionOptions,
				)
				.exec();

			const overbookedRows = await this.roomInventoryModel
				.find({
					roomId: roomObjectId,
					date: { $gte: startDate },
					booked: { $gt: input.totalRooms },
				})
				.select('_id booked')
				.session(input.session ?? null)
				.exec();

			if (overbookedRows.length > 0) {
				const bulkOps = overbookedRows.map((row) => {
					const updateSet: Record<string, number> = {
						total: row.booked,
					};
					if (input.basePrice !== undefined) {
						updateSet.basePrice = input.basePrice;
					}
					return {
						updateOne: {
							filter: { _id: row._id },
							update: { $set: updateSet },
						},
					};
				});

				await this.roomInventoryModel.bulkWrite(bulkOps, sessionOptions);
			}

			return;
		}

		// basePrice-only sync
		await this.roomInventoryModel
			.updateMany(
				{
					roomId: roomObjectId,
					date: { $gte: startDate },
				},
				{
					$set: { basePrice: input.basePrice },
				},
				sessionOptions,
			)
			.exec();
	}

	public async getAvailableRoomsOnDate(roomId: string, date: Date): Promise<number | null> {
		const roomObjectId = this.toObjectId(roomId);
		const targetDate = this.normalizeToUtcDay(date);
		const row = await this.roomInventoryModel
			.findOne({
				roomId: roomObjectId,
				date: targetDate,
			})
			.select('total booked closed')
			.exec();

		if (!row) {
			return null;
		}
		if (row.closed) {
			return 0;
		}

		return Math.max(0, (row.total ?? 0) - (row.booked ?? 0));
	}

	private async ensureInventoryExists(
		roomId: Types.ObjectId,
		checkInDate: Date,
		checkOutDate: Date,
		session?: ClientSession,
	): Promise<void> {
		const dates = this.buildStayDates(checkInDate, checkOutDate);
		if (dates.length === 0) {
			return;
		}

		const existing = await this.roomInventoryModel
			.countDocuments({
				roomId,
				date: { $in: dates },
			})
			.session(session ?? null)
			.exec();

		if (existing !== dates.length) {
			throw new BadRequestException('Inventory rows are missing for one or more requested nights');
		}
	}

	private assertValidReserveInput(input: ReserveInventoryInput): void {
		if (!input.roomId) {
			throw new BadRequestException('roomId is required');
		}
		if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
			throw new BadRequestException('quantity must be a positive integer');
		}
		if (!(input.checkInDate instanceof Date) || Number.isNaN(input.checkInDate.getTime())) {
			throw new BadRequestException('checkInDate is invalid');
		}
		if (!(input.checkOutDate instanceof Date) || Number.isNaN(input.checkOutDate.getTime())) {
			throw new BadRequestException('checkOutDate is invalid');
		}
		if (input.checkOutDate.getTime() <= input.checkInDate.getTime()) {
			throw new BadRequestException('checkOutDate must be after checkInDate');
		}
	}

	private buildStayDates(checkInDate: Date, checkOutDate: Date): Date[] {
		const start = this.normalizeToUtcDay(checkInDate);
		const end = this.normalizeToUtcDay(checkOutDate);
		const dates: Date[] = [];

		const current = new Date(start);
		while (current < end) {
			dates.push(new Date(current));
			current.setUTCDate(current.getUTCDate() + 1);
		}

		return dates;
	}

	private buildDateWindow(startDate: Date, days: number): Date[] {
		const start = this.normalizeToUtcDay(startDate);
		const dates: Date[] = [];

		for (let i = 0; i < days; i++) {
			const date = new Date(start);
			date.setUTCDate(date.getUTCDate() + i);
			dates.push(date);
		}

		return dates;
	}

	private normalizeToUtcDay(date: Date): Date {
		return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
	}

	private toObjectId(id: string): Types.ObjectId {
		if (!Types.ObjectId.isValid(id)) {
			throw new BadRequestException('Invalid roomId');
		}
		return new Types.ObjectId(id);
	}
}
