import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import FollowSchema from '../../schemas/Follow.model';
import { FollowService } from './follow.service';
import { FollowResolver } from './follow.resolver';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { LikeModule } from '../like/like.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Follow', schema: FollowSchema }]),
		AuthModule,
		forwardRef(() => MemberModule),
		LikeModule,
	],
	providers: [FollowService, FollowResolver],
	exports: [FollowService],
})
export class FollowModule {}
