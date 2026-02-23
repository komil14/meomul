import { Logger } from '@nestjs/common';
import type { Connection } from 'mongoose';

const monitoredConnections = new WeakSet<Connection>();

type MongoCommandSucceededEvent = {
	commandName?: string;
	duration?: number;
	command?: Record<string, unknown>;
};

const getCollectionName = (event: MongoCommandSucceededEvent): string => {
	const command = event.command ?? {};
	const commandName = event.commandName ?? '';

	if (commandName === 'find' && typeof command.find === 'string') return command.find;
	if (commandName === 'aggregate' && typeof command.aggregate === 'string') return command.aggregate;
	if (commandName === 'update' && typeof command.update === 'string') return command.update;
	if (commandName === 'delete' && typeof command.delete === 'string') return command.delete;
	if (commandName === 'insert' && typeof command.insert === 'string') return command.insert;
	if (commandName === 'findAndModify' && typeof command.findAndModify === 'string') return command.findAndModify;
	return 'unknown';
};

export const attachMongoSlowQueryMonitor = (connection: Connection, source: 'api' | 'batch'): void => {
	const enabled = process.env.MONGO_SLOW_QUERY_LOG === 'true';
	if (!enabled) return;
	if (monitoredConnections.has(connection)) return;

	const thresholdMs = Number(process.env.MONGO_SLOW_QUERY_MS ?? 300);
	const logger = new Logger(`MongoSlow:${source}`);

	monitoredConnections.add(connection);
	connection.getClient().on('commandSucceeded', (event: MongoCommandSucceededEvent) => {
		const durationMs = typeof event.duration === 'number' ? event.duration : 0;
		if (durationMs < thresholdMs) return;

		const commandName = event.commandName ?? 'unknown';
		const collection = getCollectionName(event);
		logger.warn(`Slow query detected command=${commandName} collection=${collection} durationMs=${durationMs}`);
	});
};
