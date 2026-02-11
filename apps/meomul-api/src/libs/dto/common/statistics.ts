import { Field, ObjectType, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class HotelStatisticsDto {
  @Field(() => Int)
  totalBookings: number;

  @Field(() => Int)
  totalRevenue: number;

  @Field(() => Float)
  averageBookingValue: number;

  @Field(() => Float)
  occupancyRate: number;

  @Field(() => Int)
  totalReviews: number;

  @Field(() => Float)
  averageRating: number;

  @Field(() => Int)
  totalViews: number;

  @Field(() => Int)
  totalLikes: number;
}

@ObjectType()
export class BookingsByMonthDto {
  @Field(() => String)
  month: string;

  @Field(() => Int)
  count: number;

  @Field(() => Int)
  revenue: number;
}

@ObjectType()
export class DashboardDto {
  @Field(() => HotelStatisticsDto)
  statistics: HotelStatisticsDto;

  @Field(() => [BookingsByMonthDto])
  bookingsByMonth: BookingsByMonthDto[];
}