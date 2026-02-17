import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ViewInput } from '../../libs/dto/view/view.input';
import { ViewDto } from '../../libs/dto/view/view';
import { ViewGroup } from '../../libs/enums/common.enum';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { ViewDocument } from '../../libs/types/view';
import { toViewDto } from '../../libs/types/view';

export interface RecordViewResult {
	view: ViewDto;
	isNewView: boolean;
}

@Injectable()
export class ViewService {
	private readonly logger = new Logger(ViewService.name);

	constructor(@InjectModel('View') private readonly viewModel: Model<ViewDocument>) {}

	/**
	 * Record a view (idempotent - won't create duplicates)
	 * Returns whether this was a new view or existing
	 */
	public async recordView(currentMember: MemberJwtPayload, input: ViewInput): Promise<RecordViewResult> {
		const viewRefId = new Types.ObjectId(input.viewRefId);
		const memberId = new Types.ObjectId(currentMember._id);

		this.logger.log(`recordView: ${input.viewGroup} ${viewRefId} by ${memberId}`);

		// Check if view already exists
		const existingView = await this.viewModel
			.findOne({
				viewRefId,
				memberId,
				viewGroup: input.viewGroup,
			})
			.exec();

		if (existingView) {
			// Already viewed - return existing view
			return {
				view: toViewDto(existingView),
				isNewView: false,
			};
		}

		// Create new view
		const view = await this.viewModel.create({
			viewRefId,
			memberId,
			viewGroup: input.viewGroup,
		});

		return {
			view: toViewDto(view),
			isNewView: true,
		};
	}

	/**
	 * Get view count for an item
	 */
	public async getViewCount(viewRefId: string, viewGroup: ViewGroup): Promise<number> {
		return this.viewModel
			.countDocuments({
				viewRefId: new Types.ObjectId(viewRefId),
				viewGroup,
			})
			.exec();
	}

	/**
	 * Check if member has viewed an item
	 */
	public async hasViewed(memberId: string, viewRefId: string, viewGroup: ViewGroup): Promise<boolean> {
		const view = await this.viewModel
			.findOne({
				viewRefId: new Types.ObjectId(viewRefId),
				memberId: new Types.ObjectId(memberId),
				viewGroup,
			})
			.exec();

		return !!view;
	}

	/**
	 * Get all views by a member for a specific group
	 */
	public async getMemberViews(memberId: string, viewGroup: ViewGroup): Promise<ViewDto[]> {
		const views = await this.viewModel
			.find({
				memberId: new Types.ObjectId(memberId),
				viewGroup,
			})
			.sort({ createdAt: -1 })
			.exec();

		return views.map(toViewDto);
	}

	/**
	 * Remove all views for a specific item (cleanup when item is deleted)
	 */
	public async removeViewsForItem(viewRefId: string, viewGroup: ViewGroup): Promise<void> {
		await this.viewModel
			.deleteMany({
				viewRefId: new Types.ObjectId(viewRefId),
				viewGroup,
			})
			.exec();
	}
}
