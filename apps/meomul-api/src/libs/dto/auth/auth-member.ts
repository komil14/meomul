import { Field, ObjectType } from '@nestjs/graphql';
import { MemberDto } from '../member/member';

@ObjectType()
export class AuthMemberDto extends MemberDto {
  @Field(() => String)
  accessToken: string;
}