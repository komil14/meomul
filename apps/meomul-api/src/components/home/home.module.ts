import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HotelModule } from '../hotel/hotel.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ReviewModule } from '../review/review.module';
import { RoomModule } from '../room/room.module';
import { HomeResolver } from './home.resolver';
import { HomeService } from './home.service';

@Module({
	imports: [AuthModule, HotelModule, RoomModule, ReviewModule, RecommendationModule],
	providers: [HomeService, HomeResolver],
})
export class HomeModule {}
