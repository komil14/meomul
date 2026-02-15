import { Schema, model } from "mongoose";
import { PaymentMethod, PaymentStatus, BookingStatus } from "../libs/enums/booking.enum";

const BookingSchema = new Schema(
  {
    guestId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },
    hotelId: {
      type: Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
      index: true,
    },
    
    rooms: [
      {
        roomId: {
          type: Schema.Types.ObjectId,
          ref: 'Room',
          required: true,
        },
        roomType: String,
        quantity: { type: Number, required: true, min: 1 },
        pricePerNight: { type: Number, required: true },
        guestName: String,
      },
    ],
    
    checkInDate: {
      type: Date,
      required: true,
      index: true,
    },
    checkOutDate: {
      type: Date,
      required: true,
    },
    nights: {
      type: Number,
      required: true,
      min: 1,
    },
    
    adultCount: {
      type: Number,
      required: true,
      min: 1,
    },
    childCount: {
      type: Number,
      default: 0,
    },
    
    subtotal: {
      type: Number,
      required: true,
    },
    weekendSurcharge: {
      type: Number,
      default: 0,
    },
    earlyCheckInFee: {
      type: Number,
      default: 0,
    },
    lateCheckOutFee: {
      type: Number,
      default: 0,
    },
    taxes: {
      type: Number,
      default: 0,
    },
    serviceFee: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paidAt: Date,
    
    bookingStatus: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true,
    },
    
    specialRequests: String,
    earlyCheckIn: {
      type: Boolean,
      default: false,
    },
    lateCheckOut: {
      type: Boolean,
      default: false,
    },
    
    cancellationDate: Date,
    cancellationReason: String,
    refundAmount: Number,
    refundDate: Date,
    refundReason: String,
    refundEvidence: [String],
    
    ageVerified: {
      type: Boolean,
      default: false,
    },
    verificationMethod: String,
    
    bookingCode: {
      type: String,
      required: true,
      unique: true,
    },
    qrCode: String,
  },
  {
    timestamps: true,
    collection: 'bookings',
  }
);

// Indexes
BookingSchema.index({ guestId: 1, bookingStatus: 1 });
BookingSchema.index({ hotelId: 1, checkInDate: 1 });

// Recommendation: trending aggregation (recent confirmed bookings)
BookingSchema.index({ bookingStatus: 1, createdAt: -1 });

export default BookingSchema;