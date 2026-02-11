import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { HotelModule } from './hotel/hotel.module';

@Module({
  imports: [MemberModule, HotelModule]
})
export class ComponentsModule {}
