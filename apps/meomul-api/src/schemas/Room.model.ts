import { Schema } from "mongoose";
import { RoomType, BedType, ViewType, RoomStatus } from "../libs/enums/room.enum";

const RoomSchema = new Schema(
  {
    hotelId: {
      type: Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
      index: true,
    },
    
    roomType: {
      type: String,
      enum: Object.values(RoomType),
      required: true,
    },
    roomNumber: String,
    roomName: {
      type: String,
      required: true,
    },
    roomDesc: {
      type: String,
      default: '',
    },
    
    maxOccupancy: {
      type: Number,
      required: true,
      min: 1,
    },
    bedType: {
      type: String,
      enum: Object.values(BedType),
      required: true,
    },
    bedCount: {
      type: Number,
      required: true,
      min: 1,
    },
    
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    weekendSurcharge: {
      type: Number,
      default: 0,
    },
    
    roomSize: {
      type: Number,
      default: 0,
    },
    viewType: {
      type: String,
      enum: Object.values(ViewType),
      default: ViewType.NONE,
    },
    roomAmenities: {
      type: [String],
      default: [],
    },
    
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    availableRooms: {
      type: Number,
      required: true,
      min: 0,
    },
    currentViewers: {
      type: Number,
      default: 0,
    },
    
    lastMinuteDeal: {
      isActive: Boolean,
      discountPercent: Number,
      originalPrice: Number,
      dealPrice: Number,
      validUntil: Date,
    },
    
    roomImages: {
      type: [String],
      default: [],
    },
    
    roomStatus: {
      type: String,
      enum: Object.values(RoomStatus),
      default: RoomStatus.AVAILABLE,
    },
  },
  {
    timestamps: true,
    collection: 'rooms',
  }
);

// Indexes
RoomSchema.index({ hotelId: 1, roomType: 1 });
RoomSchema.index({ roomStatus: 1 });
RoomSchema.index({ 'lastMinuteDeal.isActive': 1, 'lastMinuteDeal.validUntil': 1 });

export default RoomSchema;