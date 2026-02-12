import { Schema } from "mongoose";
import { HotelType, HotelLocation, VerificationStatus, BadgeLevel, CancellationPolicy, HotelStatus } from "../libs/enums/hotel.enum";

const HotelSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },
    
    hotelType: {
      type: String,
      enum: Object.values(HotelType),
      required: true,
    },
    hotelTitle: {
      type: String,
      required: true,
      index: true,
    },
    hotelDesc: {
      type: String,
      default: '',
    },
    hotelLocation: {
      type: String,
      enum: Object.values(HotelLocation),
      required: true,
      index: true,
    },
    
    detailedLocation: {
      city: {
        type: String,
        enum: Object.values(HotelLocation),
        required: true,
      },
      district: String,
      dong: String,
      address: {
        type: String,
        required: true,
      },
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
      nearestSubway: String,
      subwayExit: String,
      subwayLines: [Number],
      walkingDistance: Number,
    },
    
    starRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    checkInTime: {
      type: String,
      default: '15:00',
    },
    checkOutTime: {
      type: String,
      default: '11:00',
    },
    
    flexibleCheckIn: {
      enabled: { type: Boolean, default: false },
      times: { type: [String], default: [] },
      fee: { type: Number, default: 0 },
    },
    flexibleCheckOut: {
      enabled: { type: Boolean, default: false },
      times: { type: [String], default: [] },
      fee: { type: Number, default: 0 },
    },
    
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    badgeLevel: {
      type: String,
      enum: Object.values(BadgeLevel),
      default: BadgeLevel.NONE,
    },
    verificationDocs: {
      businessLicense: String,
      touristLicense: String,
      propertyOwnership: String,
    },
    lastInspectionDate: Date,
    
    cancellationPolicy: {
      type: String,
      enum: Object.values(CancellationPolicy),
      default: CancellationPolicy.MODERATE,
    },
    ageRestriction: {
      type: Number,
      default: 19,
    },
    petsAllowed: {
      type: Boolean,
      default: false,
    },
    maxPetWeight: Number,
    smokingAllowed: {
      type: Boolean,
      default: false,
    },
    
    amenities: {
      workspace: { type: Boolean, default: false },
      wifi: { type: Boolean, default: true },
      wifiSpeed: Number,
      meetingRoom: { type: Boolean, default: false },
      
      coupleRoom: { type: Boolean, default: false },
      romanticView: { type: Boolean, default: false },
      privateBath: { type: Boolean, default: false },
      
      familyRoom: { type: Boolean, default: false },
      kidsFriendly: { type: Boolean, default: false },
      playground: { type: Boolean, default: false },
      
      pool: { type: Boolean, default: false },
      spa: { type: Boolean, default: false },
      roomService: { type: Boolean, default: false },
      restaurant: { type: Boolean, default: false },
      
      parking: { type: Boolean, default: false },
      parkingFee: { type: Number, default: 0 },
      breakfast: { type: Boolean, default: false },
      breakfastIncluded: { type: Boolean, default: false },
      gym: { type: Boolean, default: false },
      airportShuttle: { type: Boolean, default: false },
      evCharging: { type: Boolean, default: false },
      
      wheelchairAccessible: { type: Boolean, default: false },
      elevator: { type: Boolean, default: false },
      accessibleBathroom: { type: Boolean, default: false },
      visualAlarms: { type: Boolean, default: false },
      serviceAnimalsAllowed: { type: Boolean, default: false },
    },
    
    safetyFeatures: {
      frontDesk24h: { type: Boolean, default: false },
      securityCameras: { type: Boolean, default: false },
      roomSafe: { type: Boolean, default: false },
      fireSafety: { type: Boolean, default: false },
      wellLitParking: { type: Boolean, default: false },
      femaleOnlyFloors: { type: Boolean, default: false },
    },
    safeStayCertified: {
      type: Boolean,
      default: false,
    },
    
    suitableFor: {
      type: [String],
      default: [],
    },
    
    hotelImages: {
      type: [String],
      default: [],
    },
    hotelVideos: {
      type: [String],
      default: [],
    },
    
    hotelViews: {
      type: Number,
      default: 0,
    },
    hotelLikes: {
      type: Number,
      default: 0,
    },
    hotelReviews: {
      type: Number,
      default: 0,
    },
    hotelRating: {
      type: Number,
      default: 0,
    },
    hotelRank: {
      type: Number,
      default: 0,
      index: true,
    },
    
    warningStrikes: {
      type: Number,
      default: 0,
    },
    strikeHistory: [
      {
        bookingId: Schema.Types.ObjectId,
        reason: String,
        date: Date,
      },
    ],
    
    hotelStatus: {
      type: String,
      enum: Object.values(HotelStatus),
      default: HotelStatus.PENDING,
      index: true,
    },
    
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'hotels',
  }
);

// Indexes
HotelSchema.index({ hotelLocation: 1, hotelStatus: 1 });
HotelSchema.index({ 'detailedLocation.dong': 1 });
HotelSchema.index({ suitableFor: 1 });
HotelSchema.index({ hotelRank: -1 });
HotelSchema.index({ hotelRating: -1 });

// Compound unique index to prevent duplicate hotels (same title + location + address)
HotelSchema.index(
  {
    hotelTitle: 1,
    hotelLocation: 1,
    'detailedLocation.address': 1
  },
  {
    unique: true,
    partialFilterExpression: { hotelStatus: { $ne: 'DELETE' } }
  }
);

export default HotelSchema;