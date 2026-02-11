import { Field, ObjectType } from '@nestjs/graphql';
import { RoomDto } from '../room/room';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class RoomsDto {
  @Field(() => [RoomDto])
  list: RoomDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}