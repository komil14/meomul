import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { LikeGroup } from '../../enums/common.enum';

@InputType()
export class LikeInput {
  @IsNotEmpty()
  @IsEnum(LikeGroup)
  @Field(() => LikeGroup)
  likeGroup: LikeGroup;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  likeRefId: string;
}