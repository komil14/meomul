import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import NotificationSchema from '../../../meomul-api/src/schemas/Notification.model';
import { CleanupService } from './cleanup.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Notification', schema: NotificationSchema }])],
	providers: [CleanupService],
})
export class CleanupModule {}
