import { Schema } from "mongoose";

const FollowSchema = new Schema(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    followingId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'follows',
  }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

export default FollowSchema;