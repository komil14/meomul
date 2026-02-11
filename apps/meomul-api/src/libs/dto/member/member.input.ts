import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, Length, Matches } from 'class-validator';
import { MemberType, MemberAuthType } from '../../enums/member.enum';

@InputType()
export class MemberInput {
  @IsNotEmpty()
  @IsEnum(MemberType)
  @Field(() => MemberType)
  memberType: MemberType;

  @IsNotEmpty()
  @IsEnum(MemberAuthType)
  @Field(() => MemberAuthType)
  memberAuthType: MemberAuthType;

  @IsNotEmpty()
  @IsString()
  @Matches(/^01[0-9]{8,9}$/, { message: 'Invalid Korean phone number format' })
  @Field(() => String)
  memberPhone: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 20)
  @Field(() => String)
  memberNick: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 100)
  @Field(() => String)
  memberPassword: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberFullName?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberImage?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberAddress?: string;
}