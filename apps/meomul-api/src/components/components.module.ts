import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { HotelModule } from './hotel/hotel.module';
import { AuthModule } from './auth/auth.module';
import { ReviewModule } from './review/review.module';
import { RoomModule } from './room/room.module';
import { BookingModule } from './booking/booking.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { FollowModule } from './follow/follow.module';
import { NotificationModule } from './notification/notification.module';
import { ChatModule } from './chat/chat.module';
import { PriceLockModule } from './price-lock/price-lock.module';
import { PriceCalendarModule } from './price-calendar/price-calendar.module';
import { StatsModule } from './stats/stats.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { SearchHistoryModule } from './search-history/search-history.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [MemberModule, HotelModule, AuthModule, ReviewModule, RoomModule, BookingModule, LikeModule, ViewModule, FollowModule, NotificationModule, ChatModule, PriceLockModule, PriceCalendarModule, StatsModule, RecommendationModule, SearchHistoryModule, UploadModule]
})
export class ComponentsModule {}
