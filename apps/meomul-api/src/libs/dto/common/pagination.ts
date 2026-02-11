import { Field, InputType, ObjectType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsEnum, Min, Max } from 'class-validator';

export enum Direction {
  ASC = 1,
  DESC = -1,
}

@InputType()
export class PaginationInput {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  page: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Field(() => Int)
  limit: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true, defaultValue: 'createdAt' })
  sort?: string;

  @IsOptional()
  @IsEnum(Direction)
  @Field(() => Int, { nullable: true, defaultValue: Direction.DESC })
  direction?: Direction;
}

@ObjectType()
export class MetaCounterDto {
  @Field(() => Int)
  total: number;
}