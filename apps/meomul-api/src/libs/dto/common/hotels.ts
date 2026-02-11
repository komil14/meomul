import { Field, ObjectType } from '@nestjs/graphql';
import { HotelDto } from '../hotel/hotel';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class HotelsDto {
  @Field(() => [HotelDto])
  list: HotelDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}