import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PriceLockSchema from '../../../meomul-api/src/schemas/PriceLock.model';
import { PriceLockService } from './price-lock.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'PriceLock', schema: PriceLockSchema }])],
	providers: [PriceLockService],
})
export class PriceLockModule {}
