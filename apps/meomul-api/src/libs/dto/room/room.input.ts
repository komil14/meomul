import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, IsArray, Min, Length } from 'class-validator';
import { RoomType, BedType, ViewType } from '../../enums/room.enum';

@InputType()
export class RoomInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  hotelId: string;

  @IsNotEmpty()
  @IsEnum(RoomType)
  @Field(() => RoomType)
  roomType: RoomType;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  roomNumber?: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Field(() => String)
  roomName: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { defaultValue: '' })
  roomDesc: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  maxOccupancy: number;

  @IsNotEmpty()
  @IsEnum(BedType)
  @Field(() => BedType)
  bedType: BedType;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  bedCount: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Field(() => Int)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 0 })
  weekendSurcharge: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 0 })
  roomSize: number;

  @IsOptional()
  @IsEnum(ViewType)
  @Field(() => ViewType, { defaultValue: ViewType.NONE })
  viewType: ViewType;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  roomAmenities: string[];

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  totalRooms: number;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  roomImages: string[];
}