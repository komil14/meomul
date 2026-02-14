import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../../meomul-api/src/schemas/Member.model';
import { SubscriptionService } from './subscription.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }])],
	providers: [SubscriptionService],
})
export class SubscriptionModule {}
