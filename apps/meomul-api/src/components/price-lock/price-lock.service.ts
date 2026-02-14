import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePriceLockInput } from '../../libs/dto/price-lock/price-lock.input';
import { PriceLockDto } from '../../libs/dto/price-lock/price-lock';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { PriceLockDocument } from '../../libs/types/price-lock';
import { toPriceLockDto } from '../../libs/types/price-lock';
import type { RoomDocument } from '../../libs/types/room';

const LOCK_DURATION_MINUTES = 30;

@Injectable()
export class PriceLockService {
	constructor(
		@InjectModel('PriceLock') private readonly priceLockModel: Model<PriceLockDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
	) {}

	/**
	 * Lock the current price for a room (30 minutes)
	 */
	public async lockPrice(currentMember: MemberJwtPayload, input: CreatePriceLockInput): Promise<PriceLockDto> {
		// Verify room exists
		const room = await this.roomModel.findById(input.roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Verify the submitted price matches the actual room price
		if (input.currentPrice !== room.basePrice) {
			throw new BadRequestException('Price has already changed. Please refresh and try again.');
		}

		// Check if user already has an active lock on this room
		const existingLock = await this.priceLockModel
			.findOne({
				userId: currentMember._id,
				roomId: input.roomId,
				expiresAt: { $gt: new Date() },
			})
			.exec();

		if (existingLock) {
			throw new BadRequestException('You already have an active price lock for this room.');
		}

		const expiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);

		const priceLock = await this.priceLockModel.create({
			userId: currentMember._id,
			roomId: input.roomId,
			lockedPrice: room.basePrice,
			expiresAt,
		});

		return toPriceLockDto(priceLock);
	}

	/**
	 * Get user's active price lock for a specific room
	 */
	public async getMyPriceLock(currentMember: MemberJwtPayload, roomId: string): Promise<PriceLockDto | null> {
		const lock = await this.priceLockModel
			.findOne({
				userId: currentMember._id,
				roomId,
				expiresAt: { $gt: new Date() },
			})
			.exec();

		return lock ? toPriceLockDto(lock) : null;
	}

	/**
	 * Get all active price locks for the current user
	 */
	public async getMyPriceLocks(currentMember: MemberJwtPayload): Promise<PriceLockDto[]> {
		const locks = await this.priceLockModel
			.find({
				userId: currentMember._id,
				expiresAt: { $gt: new Date() },
			})
			.sort({ createdAt: -1 })
			.exec();

		return locks.map(toPriceLockDto);
	}

	/**
	 * Cancel a price lock
	 */
	public async cancelPriceLock(currentMember: MemberJwtPayload, priceLockId: string): Promise<boolean> {
		const lock = await this.priceLockModel.findById(priceLockId).exec();
		if (!lock) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (lock.userId.toString() !== currentMember._id) {
			throw new BadRequestException(Messages.NOT_ALLOWED_REQUEST);
		}

		await this.priceLockModel.findByIdAndDelete(priceLockId).exec();
		return true;
	}

	/**
	 * Get the effective price for a room.
	 * Priority: Price Lock > Last-Minute Deal > Base Price
	 * Used by BookingService during checkout
	 */
	public async getEffectivePrice(
		userId: string,
		roomId: string,
	): Promise<{ price: number; isLocked: boolean; isDeal: boolean; discountPercent: number }> {
		const lock = await this.priceLockModel
			.findOne({
				userId,
				roomId,
				expiresAt: { $gt: new Date() },
			})
			.exec();

		if (lock) {
			return { price: lock.lockedPrice, isLocked: true, isDeal: false, discountPercent: 0 };
		}

		const room = await this.roomModel.findById(roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Check for active last-minute deal
		if (
			room.lastMinuteDeal &&
			room.lastMinuteDeal.isActive &&
			room.lastMinuteDeal.validUntil > new Date()
		) {
			return {
				price: room.lastMinuteDeal.dealPrice,
				isLocked: false,
				isDeal: true,
				discountPercent: room.lastMinuteDeal.discountPercent,
			};
		}

		return { price: room.basePrice, isLocked: false, isDeal: false, discountPercent: 0 };
	}
}
