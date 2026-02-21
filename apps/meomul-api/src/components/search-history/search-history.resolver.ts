import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { SearchHistoryDto } from '../../libs/dto/search-history/search-history';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { SearchHistoryService } from './search-history.service';

@Resolver()
export class SearchHistoryResolver {
	private readonly logger = new Logger(SearchHistoryResolver.name);

	constructor(private readonly searchHistoryService: SearchHistoryService) {}

	/**
	 * Get current user's recent search history
	 */
	@Query(() => [SearchHistoryDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMySearchHistory(
		@CurrentMember() currentMember: any,
		@Args('limit', { type: () => Int, nullable: true }) limit?: number,
	): Promise<SearchHistoryDto[]> {
		try {
			this.logger.log('Query getMySearchHistory', currentMember?._id ?? 'unknown', limit);
			return this.searchHistoryService.getMySearchHistory(currentMember, limit ?? 10);
		} catch (error) {
			this.logger.error('Query getMySearchHistory failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Delete a single search history item
	 */
	@Mutation(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async deleteSearchHistoryItem(
		@CurrentMember() currentMember: any,
		@Args('historyId') historyId: string,
	): Promise<boolean> {
		try {
			this.logger.log('Mutation deleteSearchHistoryItem', currentMember?._id ?? 'unknown', historyId);
			return this.searchHistoryService.deleteSearchHistoryItem(currentMember, historyId);
		} catch (error) {
			this.logger.error('Mutation deleteSearchHistoryItem failed', currentMember?._id ?? 'unknown', historyId, error);
			throw error;
		}
	}

	/**
	 * Clear all search history for current user, returns number of deleted records
	 */
	@Mutation(() => Int)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async clearMySearchHistory(@CurrentMember() currentMember: any): Promise<number> {
		try {
			this.logger.log('Mutation clearMySearchHistory', currentMember?._id ?? 'unknown');
			return this.searchHistoryService.clearMySearchHistory(currentMember);
		} catch (error) {
			this.logger.error('Mutation clearMySearchHistory failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}
}
