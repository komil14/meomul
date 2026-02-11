import { Field, ObjectType, Int, Float } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import {
  HotelType,
  HotelLocation,
  HotelStatus,
  VerificationStatus,
  BadgeLevel,
  CancellationPolicy,
} from '../../enums/hotel.enum';

// Sub-types
@ObjectType()
export class CoordinatesDto {
  @Field(() => Float)
  lat: number;

  @Field(() => Float)
  lng: number;
}

@ObjectType()
export class DetailedLocationDto {
  @Field(() => HotelLocation)
  city: HotelLocation;

  @Field(() => String, { nullable: true })
  district?: string;

  @Field(() => String, { nullable: true })
  dong?: string;

  @Field(() => String)
  address: string;

  @Field(() => CoordinatesDto)
  coordinates: CoordinatesDto;

  @Field(() => String, { nullable: true })
  nearestSubway?: string;

  @Field(() => String, { nullable: true })
  subwayExit?: string;

  @Field(() => [Int], { nullable: true })
  subwayLines?: number[];

  @Field(() => Int, { nullable: true })
  walkingDistance?: number;
}

@ObjectType()
export class FlexibleTimingDto {
  @Field(() => Boolean)
  enabled: boolean;

  @Field(() => [String])
  times: string[];

  @Field(() => Int)
  fee: number;
}

@ObjectType()
export class AmenitiesDto {
  // Business
  @Field(() => Boolean)
  workspace: boolean;

  @Field(() => Boolean)
  wifi: boolean;

  @Field(() => Int, { nullable: true })
  wifiSpeed?: number;

  @Field(() => Boolean)
  meetingRoom: boolean;

  // Romantic
  @Field(() => Boolean)
  coupleRoom: boolean;

  @Field(() => Boolean)
  romanticView: boolean;

  @Field(() => Boolean)
  privateBath: boolean;

  // Family
  @Field(() => Boolean)
  familyRoom: boolean;

  @Field(() => Boolean)
  kidsFriendly: boolean;

  @Field(() => Boolean)
  playground: boolean;

  // Staycation
  @Field(() => Boolean)
  pool: boolean;

  @Field(() => Boolean)
  spa: boolean;

  @Field(() => Boolean)
  roomService: boolean;

  @Field(() => Boolean)
  restaurant: boolean;

  // General
  @Field(() => Boolean)
  parking: boolean;

  @Field(() => Int)
  parkingFee: number;

  @Field(() => Boolean)
  breakfast: boolean;

  @Field(() => Boolean)
  breakfastIncluded: boolean;

  @Field(() => Boolean)
  gym: boolean;

  @Field(() => Boolean)
  airportShuttle: boolean;

  @Field(() => Boolean)
  evCharging: boolean;

  // Accessibility
  @Field(() => Boolean)
  wheelchairAccessible: boolean;

  @Field(() => Boolean)
  elevator: boolean;

  @Field(() => Boolean)
  accessibleBathroom: boolean;

  @Field(() => Boolean)
  visualAlarms: boolean;

  @Field(() => Boolean)
  serviceAnimalsAllowed: boolean;
}

@ObjectType()
export class SafetyFeaturesDto {
  @Field(() => Boolean)
  frontDesk24h: boolean;

  @Field(() => Boolean)
  securityCameras: boolean;

  @Field(() => Boolean)
  roomSafe: boolean;

  @Field(() => Boolean)
  fireSafety: boolean;

  @Field(() => Boolean)
  wellLitParking: boolean;

  @Field(() => Boolean)
  femaleOnlyFloors: boolean;
}

@ObjectType()
export class VerificationDocsDto {
  @Field(() => String, { nullable: true })
  businessLicense?: string;

  @Field(() => String, { nullable: true })
  touristLicense?: string;

  @Field(() => String, { nullable: true })
  propertyOwnership?: string;
}

// Main DTO
@ObjectType()
export class HotelDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  memberId: ObjectId;

  // Basic Info
  @Field(() => HotelType)
  hotelType: HotelType;

  @Field(() => String)
  hotelTitle: string;

  @Field(() => String)
  hotelDesc: string;

  @Field(() => HotelLocation)
  hotelLocation: HotelLocation;

  @Field(() => DetailedLocationDto)
  detailedLocation: DetailedLocationDto;

  // Hotel Specifics
  @Field(() => Int)
  starRating: number;

  @Field(() => String)
  checkInTime: string;

  @Field(() => String)
  checkOutTime: string;

  @Field(() => FlexibleTimingDto)
  flexibleCheckIn: FlexibleTimingDto;

  @Field(() => FlexibleTimingDto)
  flexibleCheckOut: FlexibleTimingDto;

  // Verification
  @Field(() => VerificationStatus)
  verificationStatus: VerificationStatus;

  @Field(() => BadgeLevel)
  badgeLevel: BadgeLevel;

  @Field(() => VerificationDocsDto)
  verificationDocs: VerificationDocsDto;

  @Field(() => Date, { nullable: true })
  lastInspectionDate?: Date;

  // Policies
  @Field(() => CancellationPolicy)
  cancellationPolicy: CancellationPolicy;

  @Field(() => Int)
  ageRestriction: number;

  @Field(() => Boolean)
  petsAllowed: boolean;

  @Field(() => Int, { nullable: true })
  maxPetWeight?: number;

  @Field(() => Boolean)
  smokingAllowed: boolean;

  // Amenities
  @Field(() => AmenitiesDto)
  amenities: AmenitiesDto;

  @Field(() => SafetyFeaturesDto)
  safetyFeatures: SafetyFeaturesDto;

  @Field(() => Boolean)
  safeStayCertified: boolean;

  // Purpose Tags
  @Field(() => [String])
  suitableFor: string[];

  // Media
  @Field(() => [String])
  hotelImages: string[];

  @Field(() => [String])
  hotelVideos: string[];

  // Statistics
  @Field(() => Int)
  hotelViews: number;

  @Field(() => Int)
  hotelLikes: number;

  @Field(() => Int)
  hotelReviews: number;

  @Field(() => Float)
  hotelRating: number;

  @Field(() => Float)
  hotelRank: number;

  @Field(() => Int)
  warningStrikes: number;

  @Field(() => HotelStatus)
  hotelStatus: HotelStatus;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}