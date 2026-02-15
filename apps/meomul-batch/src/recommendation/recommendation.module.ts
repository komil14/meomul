import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ViewSchema from '../../../meomul-api/src/schemas/View.model';
import RecommendationCacheSchema from '../../../meomul-api/src/schemas/RecommendationCache.model';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'View', schema: ViewSchema },
			{ name: 'RecommendationCache', schema: RecommendationCacheSchema },
		]),
	],
	providers: [RecommendationService],
})
export class RecommendationModule {}
