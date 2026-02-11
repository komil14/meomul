import { Field, ObjectType, Int } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { BookingStatus, PaymentStatus, PaymentMethod } from '../../enums/booking.enum';

@ObjectType()
export class BookedRoomDto {
  @Field(() => String)
  roomId: ObjectId;

  @Field(() => String)
  roomType: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Int)
  pricePerNight: number;

  @Field(() => String, { nullable: true })
  guestName?: string;
}

@ObjectType()
export class BookingDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  guestId: ObjectId;

  @Field(() => String)
  hotelId: ObjectId;

  @Field(() => [BookedRoomDto])
  rooms: BookedRoomDto[];

  @Field(() => Date)
  checkInDate: Date;

  @Field(() => Date)
  checkOutDate: Date;

  @Field(() => Int)
  nights: number;

  @Field(() => Int)
  adultCount: number;

  @Field(() => Int)
  childCount: number;

  @Field(() => Int)
  subtotal: number;

  @Field(() => Int)
  weekendSurcharge: number;

  @Field(() => Int)
  earlyCheckInFee: number;

  @Field(() => Int)
  lateCheckOutFee: number;

  @Field(() => Int)
  taxes: number;

  @Field(() => Int)
  serviceFee: number;

  @Field(() => Int)
  discount: number;

  @Field(() => Int)
  totalPrice: number;

  @Field(() => PaymentMethod)
  paymentMethod: PaymentMethod;

  @Field(() => PaymentStatus)
  paymentStatus: PaymentStatus;

  @Field(() => Int)
  paidAmount: number;

  @Field(() => Date, { nullable: true })
  paidAt?: Date;

  @Field(() => BookingStatus)
  bookingStatus: BookingStatus;

  @Field(() => String, { nullable: true })
  specialRequests?: string;

  @Field(() => Boolean)
  earlyCheckIn: boolean;

  @Field(() => Boolean)
  lateCheckOut: boolean;

  @Field(() => Date, { nullable: true })
  cancellationDate?: Date;

  @Field(() => String, { nullable: true })
  cancellationReason?: string;

  @Field(() => Int, { nullable: true })
  refundAmount?: number;

  @Field(() => Date, { nullable: true })
  refundDate?: Date;

  @Field(() => String, { nullable: true })
  refundReason?: string;

  @Field(() => [String], { nullable: true })
  refundEvidence?: string[];

  @Field(() => Boolean)
  ageVerified: boolean;

  @Field(() => String, { nullable: true })
  verificationMethod?: string;

  @Field(() => String)
  bookingCode: string;

  @Field(() => String, { nullable: true })
  qrCode?: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}