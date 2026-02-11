import { Field, ObjectType } from '@nestjs/graphql';
import { BookingDto } from '../booking/booking';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class BookingsDto {
  @Field(() => [BookingDto])
  list: BookingDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}