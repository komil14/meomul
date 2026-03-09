import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Document } from 'mongoose';

interface JobLockDocument extends Document {
	name: string;
	owner: string;
	lockedUntil: Date;
	lastStartedAt?: Date;
	lastFinishedAt?: Date;
	lastError?: string;
}

@Injectable()
export class CronLockService {
	private readonly logger = new Logger(CronLockService.name);
	private readonly ownerId = `${process.env.HOSTNAME ?? 'local'}:${process.pid}`;

	constructor(@InjectModel('JobLock') private readonly jobLockModel: Model<JobLockDocument>) {}

	public async runLocked(jobName: string, ttlMs: number, task: () => Promise<void>): Promise<void> {
		const now = new Date();
		const lockUntil = new Date(now.getTime() + ttlMs);

		let acquired = false;

		try {
			const lockDoc = await this.jobLockModel
				.findOneAndUpdate(
					{
						name: jobName,
						$or: [{ lockedUntil: { $lte: now } }, { owner: this.ownerId }],
					},
					{
						$set: {
							name: jobName,
							owner: this.ownerId,
							lockedUntil: lockUntil,
							lastStartedAt: now,
							lastError: null,
						},
					},
					{
						upsert: true,
						returnDocument: 'after',
						setDefaultsOnInsert: true,
					},
				)
				.exec();

			acquired = Boolean(lockDoc && lockDoc.owner === this.ownerId);
		} catch (error: unknown) {
			// Duplicate key can happen during simultaneous upsert attempts.
			const duplicateKey = error instanceof Error && error.message.includes('E11000');
			if (!duplicateKey) {
				this.logger.error(`Failed acquiring lock for job "${jobName}"`, error);
			}
		}

		if (!acquired) {
			this.logger.debug(`Skipped job "${jobName}" because another instance holds the lock`);
			return;
		}

		const startedAt = Date.now();
		try {
			await task();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			await this.jobLockModel
				.updateOne(
					{ name: jobName, owner: this.ownerId },
					{
						$set: {
							lastError: message.slice(0, 1000),
							lastFinishedAt: new Date(),
						},
					},
				)
				.exec();
			this.logger.error(`Job "${jobName}" failed`, error);
			void this.sendFailureAlert(jobName, message);
			throw error;
		} finally {
			const durationMs = Date.now() - startedAt;
			await this.jobLockModel
				.updateOne(
					{ name: jobName, owner: this.ownerId },
					{
						$set: {
							lockedUntil: new Date(0),
							lastFinishedAt: new Date(),
						},
					},
				)
				.exec();
			this.logger.log(`Job "${jobName}" completed in ${durationMs}ms`);
		}
	}

	private async sendFailureAlert(jobName: string, errorMessage: string): Promise<void> {
		const webhookUrl = process.env.BATCH_ALERT_WEBHOOK_URL;
		if (!webhookUrl) return;

		try {
			await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					job: jobName,
					error: errorMessage,
					host: this.ownerId,
					at: new Date().toISOString(),
				}),
			});
		} catch {
			// Never let the webhook failure propagate or crash the worker
		}
	}
}
