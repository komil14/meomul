import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, IsArray, Min } from 'class-validator';
import { RoomStatus, ViewType } from '../../enums/room.enum';

@InputType()
export class RoomUpdate {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  _id: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  roomName?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  roomDesc?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Field(() => Int, { nullable: true })
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  weekendSurcharge?: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  roomSize?: number;

  @IsOptional()
  @IsEnum(ViewType)
  @Field(() => ViewType, { nullable: true })
  viewType?: ViewType;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  roomAmenities?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Field(() => Int, { nullable: true })
  totalRooms?: number;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  roomImages?: string[];

  @IsOptional()
  @IsEnum(RoomStatus)
  @Field(() => RoomStatus, { nullable: true })
  roomStatus?: RoomStatus;
}