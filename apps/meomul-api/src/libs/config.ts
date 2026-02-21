import { ObjectId } from 'bson';
export const shapeIntoMongoObjectId = (target: any) => {
	return typeof target === 'string' ? new ObjectId(target) : target;
};

export const VALID_TARGETS = ['member', 'hotel', 'room', 'review', 'refund'] as const;
export type UploadTarget = (typeof VALID_TARGETS)[number];

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
export const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024;  // 5MB