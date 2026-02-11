import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { HotelModule } from './hotel/hotel.module';
import { AuthModule } from './auth/auth.module';
import { ReviewModule } from './review/review.module';
import { RoomModule } from './room/room.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { FollowModule } from './follow/follow.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [MemberModule, HotelModule, AuthModule, ReviewModule, RoomModule, LikeModule, ViewModule, FollowModule, NotificationModule]
})
export class ComponentsModule {}
