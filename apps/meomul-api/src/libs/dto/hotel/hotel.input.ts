import { Field, InputType, Int, Float } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, IsBoolean, IsArray, Min, Max, Length } from 'class-validator';
import { HotelType, HotelLocation, CancellationPolicy } from '../../enums/hotel.enum';

// Sub-inputs
@InputType()
export class CoordinatesInput {
  @IsNotEmpty()
  @IsNumber()
  @Field(() => Float)
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  @Field(() => Float)
  lng: number;
}

@InputType()
export class DetailedLocationInput {
  @IsNotEmpty()
  @IsEnum(HotelLocation)
  @Field(() => HotelLocation)
  city: HotelLocation;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  district?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  dong?: string;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  address: string;

  @IsNotEmpty()
  @Field(() => CoordinatesInput)
  coordinates: CoordinatesInput;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  nearestSubway?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  subwayExit?: string;

  @IsOptional()
  @IsArray()
  @Field(() => [Int], { nullable: true })
  subwayLines?: number[];

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  walkingDistance?: number;
}

@InputType()
export class FlexibleTimingInput {
  @IsNotEmpty()
  @IsBoolean()
  @Field(() => Boolean)
  enabled: boolean;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  times: string[];

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 0 })
  fee: number;
}

@InputType()
export class AmenitiesInput {
  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  workspace: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: true })
  wifi: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  wifiSpeed?: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  meetingRoom: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  coupleRoom: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  romanticView: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  privateBath: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  familyRoom: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  kidsFriendly: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  playground: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  pool: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  spa: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  roomService: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  restaurant: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  parking: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 0 })
  parkingFee: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  breakfast: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  breakfastIncluded: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  gym: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  airportShuttle: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  evCharging: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  wheelchairAccessible: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  elevator: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  accessibleBathroom: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  visualAlarms: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  serviceAnimalsAllowed: boolean;
}

@InputType()
export class SafetyFeaturesInput {
  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  frontDesk24h: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  securityCameras: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  roomSafe: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  fireSafety: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  wellLitParking: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  femaleOnlyFloors: boolean;
}

// Main Input
@InputType()
export class HotelInput {
  @IsNotEmpty()
  @IsEnum(HotelType)
  @Field(() => HotelType)
  hotelType: HotelType;

  @IsNotEmpty()
  @IsString()
  @Length(5, 100)
  @Field(() => String)
  hotelTitle: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { defaultValue: '' })
  hotelDesc: string;

  @IsNotEmpty()
  @IsEnum(HotelLocation)
  @Field(() => HotelLocation)
  hotelLocation: HotelLocation;

  @IsNotEmpty()
  @Field(() => DetailedLocationInput)
  detailedLocation: DetailedLocationInput;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Int, { defaultValue: 3 })
  starRating: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { defaultValue: '15:00' })
  checkInTime: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { defaultValue: '11:00' })
  checkOutTime: string;

  @IsOptional()
  @Field(() => FlexibleTimingInput, { nullable: true })
  flexibleCheckIn?: FlexibleTimingInput;

  @IsOptional()
  @Field(() => FlexibleTimingInput, { nullable: true })
  flexibleCheckOut?: FlexibleTimingInput;

  @IsOptional()
  @IsEnum(CancellationPolicy)
  @Field(() => CancellationPolicy, { defaultValue: CancellationPolicy.MODERATE })
  cancellationPolicy: CancellationPolicy;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { defaultValue: 19 })
  ageRestriction: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  petsAllowed: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  maxPetWeight?: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { defaultValue: false })
  smokingAllowed: boolean;

  @IsOptional()
  @Field(() => AmenitiesInput, { nullable: true })
  amenities?: AmenitiesInput;

  @IsOptional()
  @Field(() => SafetyFeaturesInput, { nullable: true })
  safetyFeatures?: SafetyFeaturesInput;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  suitableFor: string[];

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  hotelImages: string[];

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  hotelVideos: string[];
}