import { Logger } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { TrackAnalyticsEventInput } from '../../libs/dto/analytics/track-analytics-event.input';
import { MemberType } from '../../libs/enums/member.enum';
import type { MemberJwtPayload } from '../../libs/types/member';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Resolver()
export class AnalyticsResolver {
	private readonly logger = new Logger(AnalyticsResolver.name);

	constructor(private readonly analyticsService: AnalyticsService) {}

	@Mutation(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR)
	public async trackAnalyticsEvent(
		@CurrentMember() currentMember: MemberJwtPayload,
		@Args('input') input: TrackAnalyticsEventInput,
	): Promise<boolean> {
		this.logger.debug('Mutation trackAnalyticsEvent', currentMember?._id ?? 'unknown', input.eventName);
		return this.analyticsService.trackEvent(currentMember, input);
	}
}
