import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ResponseDto {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;

  @Field(() => String, { nullable: true })
  data?: string;
}