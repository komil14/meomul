import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import UserProfileSchema from '../../schemas/UserProfile.model';
import HostApplicationSchema from '../../schemas/HostApplication.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			{ name: 'UserProfile', schema: UserProfileSchema },
			{ name: 'HostApplication', schema: HostApplicationSchema },
		]),
		AuthModule,
		NotificationModule,
		RecommendationModule,
	],
	providers: [MemberResolver, MemberService],
	exports: [MemberService],
})
export class MemberModule {}
