import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { UploadGuard } from './upload.guard';

@Module({
	imports: [AuthModule],
	controllers: [UploadController],
	providers: [UploadGuard],
})
export class UploadModule {}
