import { Field, ObjectType } from '@nestjs/graphql';
import { AnalyticsEventDto } from '../analytics/analytics-event';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class AnalyticsEventsDto {
	@Field(() => [AnalyticsEventDto])
	list: AnalyticsEventDto[];

	@Field(() => MetaCounterDto)
	metaCounter: MetaCounterDto;
}
