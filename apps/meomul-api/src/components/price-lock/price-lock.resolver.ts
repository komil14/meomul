import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PriceLockDto } from '../../libs/dto/price-lock/price-lock';
import { CreatePriceLockInput } from '../../libs/dto/price-lock/price-lock.input';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { PriceLockService } from './price-lock.service';

@Resolver()
export class PriceLockResolver {
	constructor(private readonly priceLockService: PriceLockService) {}

	/**
	 * Lock the current price for a room
	 */
	@Mutation(() => PriceLockDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async lockPrice(
		@CurrentMember() currentMember: any,
		@Args('input') input: CreatePriceLockInput,
	): Promise<PriceLockDto> {
		console.log('Mutation lockPrice', currentMember?._id, input.roomId);
		return this.priceLockService.lockPrice(currentMember, input);
	}

	/**
	 * Get active price lock for a specific room
	 */
	@Query(() => PriceLockDto, { nullable: true })
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyPriceLock(
		@CurrentMember() currentMember: any,
		@Args('roomId') roomId: string,
	): Promise<PriceLockDto | null> {
		console.log('Query getMyPriceLock', currentMember?._id, roomId);
		return this.priceLockService.getMyPriceLock(currentMember, roomId);
	}

	/**
	 * Get all active price locks for current user
	 */
	@Query(() => [PriceLockDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyPriceLocks(@CurrentMember() currentMember: any): Promise<PriceLockDto[]> {
		console.log('Query getMyPriceLocks', currentMember?._id);
		return this.priceLockService.getMyPriceLocks(currentMember);
	}

	/**
	 * Cancel a price lock
	 */
	@Mutation(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async cancelPriceLock(
		@CurrentMember() currentMember: any,
		@Args('priceLockId') priceLockId: string,
	): Promise<boolean> {
		console.log('Mutation cancelPriceLock', currentMember?._id, priceLockId);
		return this.priceLockService.cancelPriceLock(currentMember, priceLockId);
	}
}
