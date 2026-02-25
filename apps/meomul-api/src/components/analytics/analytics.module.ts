import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AnalyticsEventSchema from '../../schemas/AnalyticsEvent.model';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService } from './analytics.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'AnalyticsEvent', schema: AnalyticsEventSchema }]), AuthModule],
	providers: [AnalyticsService, AnalyticsResolver],
	exports: [AnalyticsService],
})
export class AnalyticsModule {}
