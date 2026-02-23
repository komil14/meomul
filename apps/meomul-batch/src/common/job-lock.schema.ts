import { Schema } from 'mongoose';

const JobLockSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		owner: {
			type: String,
			required: true,
		},
		lockedUntil: {
			type: Date,
			required: true,
			index: true,
		},
		lastStartedAt: Date,
		lastFinishedAt: Date,
		lastError: String,
	},
	{
		timestamps: true,
		collection: 'joblocks',
	},
);

export default JobLockSchema;
