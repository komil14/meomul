import { Field, InputType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { HotelLocation, HotelType } from '../../enums/hotel.enum';
import { StayPurpose } from '../../enums/common.enum';

@InputType()
export class HostApplicationInput {
	@IsString()
	@Length(2, 80)
	@Field(() => String)
	businessName: string;

	@IsString()
	@Length(20, 1200)
	@Field(() => String)
	businessDescription: string;

	@IsOptional()
	@IsString()
	@Matches(/^[0-9+\-()\s]{8,20}$/, { message: 'Invalid contact phone format' })
	@Field(() => String, { nullable: true })
	contactPhone?: string;

	@IsOptional()
	@IsString()
	@Length(3, 120)
	@Field(() => String, { nullable: true })
	businessEmail?: string;

	@IsOptional()
	@IsString()
	@Length(2, 120)
	@Field(() => String, { nullable: true })
	intendedHotelName?: string;

	@IsOptional()
	@IsEnum(HotelLocation)
	@Field(() => HotelLocation, { nullable: true })
	intendedHotelLocation?: HotelLocation;

	@IsEnum(HotelType)
	@Field(() => HotelType)
	hotelType: HotelType;

	@IsOptional()
	@IsArray()
	@IsEnum(StayPurpose, { each: true })
	@Field(() => [StayPurpose], { defaultValue: [] })
	suitableFor: StayPurpose[];

	@IsOptional()
	@IsString()
	@Length(0, 1000)
	@Field(() => String, { nullable: true })
	notes?: string;
}
