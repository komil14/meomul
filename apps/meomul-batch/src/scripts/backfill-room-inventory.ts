import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { RoomStatus } from '../../../meomul-api/src/libs/enums/room.enum';
import type { RoomDocument } from '../../../meomul-api/src/libs/types/room';
import type { RoomInventoryDocument } from '../../../meomul-api/src/libs/types/room-inventory';
import { MeomulBatchModule } from '../meomul-batch.module';

interface ParsedArgs {
	days: number;
	startDate: Date;
	roomId?: string;
	includeInactive: boolean;
	batchSize: number;
	help: boolean;
}

interface LeanRoom {
	_id: Types.ObjectId;
	totalRooms?: number;
	basePrice?: number;
	roomStatus?: RoomStatus;
}

const logger = new Logger('RoomInventoryBackfill');

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUtcDate(value: Date): Date {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}

function parseDate(value: string | undefined): Date {
	if (!value) return normalizeUtcDate(new Date());
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid --start value "${value}". Use YYYY-MM-DD.`);
	}
	return normalizeUtcDate(parsed);
}

function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2);
	const getArgValue = (key: string): string | undefined => {
		const item = args.find((token) => token.startsWith(`${key}=`));
		return item ? item.slice(key.length + 1) : undefined;
	};

	return {
		days: parsePositiveInt(getArgValue('--days'), 365),
		startDate: parseDate(getArgValue('--start')),
		roomId: getArgValue('--roomId'),
		includeInactive: args.includes('--include-inactive'),
		batchSize: parsePositiveInt(getArgValue('--batch-size'), 500),
		help: args.includes('--help') || args.includes('-h'),
	};
}

function printHelp(): void {
	console.log(`Usage:
  npm run backfill:room-inventory -- [--days=365] [--start=YYYY-MM-DD] [--roomId=<id>] [--batch-size=500] [--include-inactive]

Examples:
  npm run backfill:room-inventory
  npm run backfill:room-inventory -- --days=730
  npm run backfill:room-inventory -- --start=2026-03-01 --days=180
  npm run backfill:room-inventory -- --roomId=65f... --days=60
`);
}

function buildDates(startDate: Date, days: number): Date[] {
	const dates: Date[] = [];
	for (let i = 0; i < days; i++) {
		const date = new Date(startDate);
		date.setUTCDate(date.getUTCDate() + i);
		dates.push(date);
	}
	return dates;
}

async function bootstrap(): Promise<void> {
	const options = parseArgs(process.argv);
	if (options.help) {
		printHelp();
		return;
	}

	const app = await NestFactory.createApplicationContext(MeomulBatchModule, { logger: false });

	try {
		const roomModel = app.get<Model<RoomDocument>>(getModelToken('Room'));
		const roomInventoryModel = app.get<Model<RoomInventoryDocument>>(getModelToken('RoomInventory'));
		const dates = buildDates(options.startDate, options.days);
		const filter: Record<string, unknown> = {};
		if (!options.includeInactive) {
			filter.roomStatus = { $ne: RoomStatus.INACTIVE };
		}
		if (options.roomId) {
			filter._id = options.roomId;
		}

		logger.log(
			`Starting room inventory backfill: start=${options.startDate.toISOString().slice(0, 10)}, days=${options.days}, batchSize=${options.batchSize}`,
		);
		if (options.roomId) {
			logger.log(`Scoped to roomId=${options.roomId}`);
		}

		const cursor = roomModel.find(filter).select('_id totalRooms basePrice roomStatus').lean().cursor();
		let processedRooms = 0;
		let totalUpserts = 0;
		let totalOperations = 0;

		for await (const room of cursor as AsyncIterable<LeanRoom>) {
			const totalRooms = room.totalRooms ?? 0;
			if (totalRooms <= 0) {
				processedRooms++;
				continue;
			}

			const operations = dates.map((date) => ({
				updateOne: {
					filter: {
						roomId: room._id,
						date,
					},
					update: {
						$setOnInsert: {
							roomId: room._id,
							date,
							total: totalRooms,
							booked: 0,
							closed: false,
							...(room.basePrice !== undefined ? { basePrice: room.basePrice } : {}),
						},
					},
					upsert: true,
				},
			}));

			for (let i = 0; i < operations.length; i += options.batchSize) {
				const chunk = operations.slice(i, i + options.batchSize);
				const result = await roomInventoryModel.bulkWrite(chunk, { ordered: false });
				totalUpserts += result.upsertedCount;
				totalOperations += chunk.length;
			}

			processedRooms++;
			if (processedRooms % 50 === 0) {
				logger.log(`Progress: rooms=${processedRooms}, operations=${totalOperations}, inserted=${totalUpserts}`);
			}
		}

		logger.log(`Backfill complete: rooms=${processedRooms}, operations=${totalOperations}, inserted=${totalUpserts}`);
	} finally {
		await app.close();
	}
}

void bootstrap();
