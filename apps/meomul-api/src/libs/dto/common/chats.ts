import { Field, ObjectType } from '@nestjs/graphql';
import { ChatDto } from '../chat/chat';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class ChatsDto {
	@Field(() => [ChatDto])
	list: ChatDto[];

	@Field(() => MetaCounterDto)
	metaCounter: MetaCounterDto;
}
