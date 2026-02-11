import { Field, ObjectType, Int, Float } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { RoomType, RoomStatus, BedType, ViewType } from '../../enums/room.enum';

@ObjectType()
export class LastMinuteDealDto {
  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => Int)
  discountPercent: number;

  @Field(() => Int)
  originalPrice: number;

  @Field(() => Int)
  dealPrice: number;

  @Field(() => Date)
  validUntil: Date;
}

@ObjectType()
export class RoomDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  hotelId: ObjectId;

  @Field(() => RoomType)
  roomType: RoomType;

  @Field(() => String, { nullable: true })
  roomNumber?: string;

  @Field(() => String)
  roomName: string;

  @Field(() => String)
  roomDesc: string;

  @Field(() => Int)
  maxOccupancy: number;

  @Field(() => BedType)
  bedType: BedType;

  @Field(() => Int)
  bedCount: number;

  @Field(() => Int)
  basePrice: number;

  @Field(() => Int)
  weekendSurcharge: number;

  @Field(() => Int)
  roomSize: number;

  @Field(() => ViewType)
  viewType: ViewType;

  @Field(() => [String])
  roomAmenities: string[];

  @Field(() => Int)
  totalRooms: number;

  @Field(() => Int)
  availableRooms: number;

  @Field(() => Int)
  currentViewers: number;

  @Field(() => LastMinuteDealDto, { nullable: true })
  lastMinuteDeal?: LastMinuteDealDto;

  @Field(() => [String])
  roomImages: string[];

  @Field(() => RoomStatus)
  roomStatus: RoomStatus;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}