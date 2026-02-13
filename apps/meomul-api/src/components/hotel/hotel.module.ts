import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import HotelSchema from '../../schemas/Hotel.model';
import { HotelService } from './hotel.service';
import { HotelResolver } from './hotel.resolver';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Hotel', schema: HotelSchema }]), AuthModule, ViewModule],
	providers: [HotelService, HotelResolver],
	exports: [HotelService],
})
export class HotelModule {}
