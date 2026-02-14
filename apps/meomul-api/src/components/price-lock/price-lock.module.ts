import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PriceLockSchema from '../../schemas/PriceLock.model';
import RoomSchema from '../../schemas/Room.model';
import { PriceLockService } from './price-lock.service';
import { PriceLockResolver } from './price-lock.resolver';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'PriceLock', schema: PriceLockSchema },
			{ name: 'Room', schema: RoomSchema },
		]),
		AuthModule,
	],
	providers: [PriceLockService, PriceLockResolver],
	exports: [PriceLockService],
})
export class PriceLockModule {}
