import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import type { RoomDocument } from '../../../meomul-api/src/libs/types/room';
import type { HotelDocument } from '../../../meomul-api/src/libs/types/hotel';
import { HotelStatus } from '../../../meomul-api/src/libs/enums/hotel.enum';
import { RoomStatus } from '../../../meomul-api/src/libs/enums/room.enum';
import { CronLockService } from '../common/cron-lock.service';

@Injectable()
export class DealService {
	private readonly logger = new Logger(DealService.name);
	private readonly targetDealCount = 12;
	private readonly perHotelLimit = 2;

	constructor(
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		private readonly cronLockService: CronLockService,
	) {}

	/**
	 * Expire last-minute deals whose validUntil has passed.
	 * Runs every 10 minutes.
	 */
	@Cron(CronExpression.EVERY_10_MINUTES)
	public async expireDeals(): Promise<void> {
		await this.cronLockService.runLocked('deal.expireDeals', 10 * 60 * 1000, async () => {
			const now = new Date();

			const result = await this.roomModel
				.updateMany(
					{
						'lastMinuteDeal.isActive': true,
						'lastMinuteDeal.validUntil': { $lt: now },
					},
					{
						$unset: { lastMinuteDeal: 1 },
					},
				)
				.exec();

			if (result.modifiedCount > 0) {
				this.logger.log(`Expired ${result.modifiedCount} last-minute deal(s)`);
			}
		});
	}

	@Cron('5 * * * *')
	public async generateDeals(): Promise<void> {
		await this.cronLockService.runLocked('deal.generateDeals', 55 * 60 * 1000, async () => {
			const now = new Date();

			const activeHotels = await this.hotelModel
				.find({ hotelStatus: HotelStatus.ACTIVE })
				.select('_id')
				.lean()
				.exec();
			const activeHotelIds = activeHotels.map((hotel) => hotel._id);
			if (activeHotelIds.length === 0) {
				return;
			}

			const activeDealRooms = await this.roomModel
				.find({
					hotelId: { $in: activeHotelIds },
					$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
					availableRooms: { $gt: 0 },
					'lastMinuteDeal.isActive': true,
					'lastMinuteDeal.validUntil': { $gt: now },
				})
				.select('_id hotelId')
				.lean()
				.exec();

			if (activeDealRooms.length >= this.targetDealCount) {
				this.logger.debug('Skipped deal generation because target active deals already exist');
				return;
			}

			const hotelDealCounts = new Map<string, number>();
			activeDealRooms.forEach((room) => {
				const hotelId = String(room.hotelId);
				hotelDealCounts.set(hotelId, (hotelDealCounts.get(hotelId) ?? 0) + 1);
			});

			const candidateRooms = await this.roomModel
				.find({
					hotelId: { $in: activeHotelIds },
					$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
					availableRooms: { $gt: 0 },
					basePrice: { $gt: 0 },
					$and: [
						{
							$or: [
								{ lastMinuteDeal: { $exists: false } },
								{ 'lastMinuteDeal.isActive': { $ne: true } },
								{ 'lastMinuteDeal.validUntil': { $lte: now } },
							],
						},
					],
				})
				.sort({
					currentViewers: -1,
					updatedAt: -1,
					basePrice: -1,
				})
				.limit(this.targetDealCount * 8)
				.exec();

			if (candidateRooms.length === 0) {
				this.logger.debug('No eligible rooms found for automatic last-minute deals');
				return;
			}

			const updates: Promise<unknown>[] = [];
			let createdCount = 0;
			for (const room of candidateRooms) {
				if (activeDealRooms.length + createdCount >= this.targetDealCount) {
					break;
				}

				const hotelId = String(room.hotelId);
				const hotelCount = hotelDealCounts.get(hotelId) ?? 0;
				if (hotelCount >= this.perHotelLimit) {
					continue;
				}

				const discountPercent = this.computeDealDiscount(String(room._id));
				const validUntil = this.computeDealValidUntil(now, String(room._id));
				const dealPrice = Math.round(room.basePrice * (1 - discountPercent / 100));

				updates.push(
					this.roomModel
						.updateOne(
							{ _id: room._id },
							{
								$set: {
									lastMinuteDeal: {
										isActive: true,
										discountPercent,
										originalPrice: room.basePrice,
										dealPrice,
										validUntil,
									},
								},
							},
						)
						.exec(),
				);

				hotelDealCounts.set(hotelId, hotelCount + 1);
				createdCount += 1;
			}

			if (updates.length === 0) {
				this.logger.debug('Skipped deal generation because no candidate passed hotel spread limits');
				return;
			}

			await Promise.all(updates);
			this.logger.log(`Generated ${createdCount} last-minute deal(s)`);
		});
	}

	private computeDealDiscount(seedValue: string): number {
		const seed = Array.from(seedValue).reduce((total, char) => total + char.charCodeAt(0), 0);
		return 12 + (seed % 15);
	}

	private computeDealValidUntil(now: Date, seedValue: string): Date {
		const seed = Array.from(seedValue).reduce((total, char) => total + char.charCodeAt(0), 0);
		const hours = 8 + (seed % 10);
		return new Date(now.getTime() + hours * 60 * 60 * 1000);
	}
}
