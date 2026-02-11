import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { ViewGroup } from '../../enums/common.enum';

@InputType()
export class ViewInput {
  @IsNotEmpty()
  @IsEnum(ViewGroup)
  @Field(() => ViewGroup)
  viewGroup: ViewGroup;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  viewRefId: string;
}