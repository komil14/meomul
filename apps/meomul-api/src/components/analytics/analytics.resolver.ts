import { Logger } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AnalyticsEventSearchInput } from '../../libs/dto/analytics/analytics-event-search.input';
import { TrackAnalyticsEventInput } from '../../libs/dto/analytics/track-analytics-event.input';
import { AnalyticsEventsDto } from '../../libs/dto/common/analytics-events';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { MemberType } from '../../libs/enums/member.enum';
import type { MemberJwtPayload } from '../../libs/types/member';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Resolver()
export class AnalyticsResolver {
	private readonly logger = new Logger(AnalyticsResolver.name);

	constructor(private readonly analyticsService: AnalyticsService) {}

	@Query(() => AnalyticsEventsDto)
	@Roles(MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async getAnalyticsEventsAdmin(
		@Args('input') input: PaginationInput,
		@Args('search', { type: () => AnalyticsEventSearchInput, nullable: true }) search?: AnalyticsEventSearchInput,
	): Promise<AnalyticsEventsDto> {
		try {
			this.logger.log('Query getAnalyticsEventsAdmin', input.page, input.limit);
			return this.analyticsService.getAnalyticsEventsAdmin(input, search);
		} catch (error) {
			this.logger.error('Query getAnalyticsEventsAdmin failed', error);
			throw error;
		}
	}

	@Mutation(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async trackAnalyticsEvent(
		@CurrentMember() currentMember: MemberJwtPayload,
		@Args('input') input: TrackAnalyticsEventInput,
	): Promise<boolean> {
		try {
			this.logger.debug('Mutation trackAnalyticsEvent', currentMember?._id ?? 'unknown', input.eventName);
			return this.analyticsService.trackEvent(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation trackAnalyticsEvent failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}
}
