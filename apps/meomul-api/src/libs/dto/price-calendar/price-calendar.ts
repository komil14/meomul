import { Field, ObjectType, Int } from '@nestjs/graphql';
import { DemandLevel } from '../../enums/common.enum';

@ObjectType()
export class DayPriceDto {
  @Field(() => String)
  date: string; // YYYY-MM-DD

  @Field(() => Int)
  price: number;

  @Field(() => Boolean)
  isWeekend: boolean;

  @Field(() => DemandLevel)
  demandLevel: DemandLevel;

  @Field(() => String, { nullable: true })
  localEvent?: string;

  @Field(() => Int, { nullable: true })
  availableRooms?: number;
}

@ObjectType()
export class CheapestDateDto {
  @Field(() => String)
  date: string;

  @Field(() => Int)
  price: number;
}

@ObjectType()
export class PriceCalendarDto {
  @Field(() => [DayPriceDto])
  calendar: DayPriceDto[];

  @Field(() => CheapestDateDto)
  cheapestDate: CheapestDateDto;

  @Field(() => CheapestDateDto)
  mostExpensiveDate: CheapestDateDto;

  @Field(() => Int)
  averagePrice: number;

  @Field(() => Int)
  savings: number; // Difference between most expensive and cheapest
}