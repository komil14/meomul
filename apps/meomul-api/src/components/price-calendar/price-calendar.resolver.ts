import { Args, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { PriceCalendarDto } from '../../libs/dto/price-calendar/price-calendar';
import { PriceCalendarInput } from '../../libs/dto/price-calendar/price-calendar.input';
import { Public } from '../auth/decorators/public.decorator';
import { PriceCalendarService } from './price-calendar.service';

@Resolver()
@Public()
export class PriceCalendarResolver {
	private readonly logger = new Logger(PriceCalendarResolver.name);

	constructor(private readonly priceCalendarService: PriceCalendarService) {}

	/**
	 * Get price calendar for a room (public - no auth required)
	 */
	@Query(() => PriceCalendarDto)
	public async getPriceCalendar(@Args('input') input: PriceCalendarInput): Promise<PriceCalendarDto> {
		this.logger.debug('Query getPriceCalendar', input.roomId, input.month);
		return this.priceCalendarService.getPriceCalendar(input);
	}
}
