import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]), AuthModule, NotificationModule],
	providers: [MemberResolver, MemberService],
	exports: [MemberService],
})
export class MemberModule {}
