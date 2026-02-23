import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplicationContext } from '@nestjs/common';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
	private readonly logger = new Logger(RedisIoAdapter.name);
	private adapterConstructor?: ReturnType<typeof createAdapter>;
	private pubClient?: RedisClientType;
	private subClient?: RedisClientType;

	constructor(app: INestApplicationContext) {
		super(app);
	}

	public async connectToRedis(redisUrl: string): Promise<void> {
		this.pubClient = createClient({ url: redisUrl });
		this.subClient = this.pubClient.duplicate();

		await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
		this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
		this.logger.log('Socket.IO Redis adapter connected');
	}

	public createIOServer(port: number, options?: ServerOptions): unknown {
		const server = super.createIOServer(port, options) as unknown;

		if (this.adapterConstructor) {
			(server as { adapter: (ctor: ReturnType<typeof createAdapter>) => void }).adapter(this.adapterConstructor);
		}

		return server;
	}

	public async closeRedisConnections(): Promise<void> {
		await Promise.allSettled([this.pubClient?.quit(), this.subClient?.quit()]);
	}
}
