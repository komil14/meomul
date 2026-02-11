import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, IsArray, IsBoolean, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../enums/booking.enum';

@InputType()
export class BookedRoomInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  roomId: string;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  roomType: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  quantity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Field(() => Int)
  pricePerNight: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  guestName?: string;
}

@InputType()
export class BookingInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  hotelId: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookedRoomInput)
  @Field(() => [BookedRoomInput])
  rooms: BookedRoomInput[];

  @IsNotEmpty()
  @Field(() => Date)
  checkInDate: Date;

  @IsNotEmpty()
  @Field(() => Date)
  checkOutDate: Date;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int)
  adultCount: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 0 })
  childCount: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  specialRequests?: string;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  earlyCheckIn: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  lateCheckOut: boolean;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  @Field(() => PaymentMethod)
  paymentMethod: PaymentMethod;
}