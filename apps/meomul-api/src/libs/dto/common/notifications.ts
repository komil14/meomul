import { Field, ObjectType } from '@nestjs/graphql';
import { NotificationDto } from '../notification/notification';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class NotificationsDto {
	@Field(() => [NotificationDto])
	list: NotificationDto[];

	@Field(() => MetaCounterDto)
	metaCounter: MetaCounterDto;
}
