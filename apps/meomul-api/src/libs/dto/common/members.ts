import { Field, ObjectType } from '@nestjs/graphql';
import { MemberDto } from '../member/member';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class MembersDto {
  @Field(() => [MemberDto])
  list: MemberDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}