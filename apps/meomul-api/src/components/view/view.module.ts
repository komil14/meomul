import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ViewSchema from '../../schemas/View.model';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ViewService } from './view.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'View', schema: ViewSchema }]), RecommendationModule],
	providers: [ViewService],
	exports: [ViewService],
})
export class ViewModule {}
