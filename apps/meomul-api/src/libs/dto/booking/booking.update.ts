import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, IsArray } from 'class-validator';
import { BookingStatus, PaymentStatus } from '../../enums/booking.enum';

@InputType()
export class BookingUpdate {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  _id: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  @Field(() => BookingStatus, { nullable: true })
  bookingStatus?: BookingStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  @Field(() => PaymentStatus, { nullable: true })
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  paidAmount?: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  cancellationReason?: string;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  refundAmount?: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  refundReason?: string;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  refundEvidence?: string[];
}