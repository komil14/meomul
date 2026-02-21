import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { SearchHistoryDto } from '../../libs/dto/search-history/search-history';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { SearchHistoryDocument } from '../../libs/types/search-history';
import { toSearchHistoryDto } from '../../libs/types/search-history';

@Injectable()
export class SearchHistoryService {
	private readonly logger = new Logger(SearchHistoryService.name);

	constructor(@InjectModel('SearchHistory') private readonly searchHistoryModel: Model<SearchHistoryDocument>) {}

	/**
	 * Get current user's recent search history
	 */
	public async getMySearchHistory(currentMember: MemberJwtPayload, limit = 10): Promise<SearchHistoryDto[]> {
		const docs = await this.searchHistoryModel
			.find({ memberId: currentMember._id })
			.sort({ createdAt: -1 })
			.limit(Math.min(limit, 50))
			.exec();

		return docs.map(toSearchHistoryDto);
	}

	/**
	 * Delete a single search history entry (must belong to current user)
	 */
	public async deleteSearchHistoryItem(currentMember: MemberJwtPayload, historyId: string): Promise<boolean> {
		if (!Types.ObjectId.isValid(historyId)) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const doc = await this.searchHistoryModel.findById(historyId).exec();

		if (!doc) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (String(doc.memberId) !== String(currentMember._id)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		await this.searchHistoryModel.deleteOne({ _id: historyId }).exec();
		this.logger.log('Deleted search history item', historyId, currentMember._id);
		return true;
	}

	/**
	 * Clear all search history for the current user, returns count of deleted records
	 */
	public async clearMySearchHistory(currentMember: MemberJwtPayload): Promise<number> {
		const result = await this.searchHistoryModel.deleteMany({ memberId: currentMember._id }).exec();

		this.logger.log('Cleared search history', currentMember._id, result.deletedCount);
		return result.deletedCount;
	}
}
