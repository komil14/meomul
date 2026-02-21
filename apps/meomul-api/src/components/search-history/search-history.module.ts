import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import SearchHistorySchema from '../../schemas/SearchHistory.model';
import { AuthModule } from '../auth/auth.module';
import { SearchHistoryService } from './search-history.service';
import { SearchHistoryResolver } from './search-history.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'SearchHistory', schema: SearchHistorySchema }]),
		AuthModule,
	],
	providers: [SearchHistoryService, SearchHistoryResolver],
	exports: [SearchHistoryService],
})
export class SearchHistoryModule {}
