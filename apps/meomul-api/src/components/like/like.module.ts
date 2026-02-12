import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import LikeSchema from '../../schemas/Like.model';
import { LikeService } from './like.service';
import { LikeResolver } from './like.resolver';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Like', schema: LikeSchema }]), AuthModule],
	providers: [LikeService, LikeResolver],
	exports: [LikeService],
})
export class LikeModule {}
