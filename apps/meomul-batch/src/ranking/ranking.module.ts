import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../../meomul-api/src/schemas/Hotel.model';
import ReviewSchema from '../../../meomul-api/src/schemas/Review.model';
import MemberSchema from '../../../meomul-api/src/schemas/Member.model';
import { RankingService } from './ranking.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Hotel', schema: HotelSchema },
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
	],
	providers: [RankingService],
})
export class RankingModule {}
