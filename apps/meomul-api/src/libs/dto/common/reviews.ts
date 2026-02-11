import { Field, ObjectType } from '@nestjs/graphql';
import { ReviewDto } from '../review/review';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class ReviewsDto {
  @Field(() => [ReviewDto])
  list: ReviewDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}