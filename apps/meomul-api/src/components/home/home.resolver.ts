import { Logger } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { MemberJwtPayload } from '../../libs/types/member';
import { HomeFeedDto } from '../../libs/dto/home/home';
import { HomeFeedInput } from '../../libs/dto/home/home.input';
import { HomeService } from './home.service';

@Resolver()
export class HomeResolver {
	private readonly logger = new Logger(HomeResolver.name);

	constructor(private readonly homeService: HomeService) {}

	@Query(() => HomeFeedDto)
	@Public()
	public async getHomeFeed(
		@Args('input', { nullable: true }) input?: HomeFeedInput,
		@CurrentMember() currentMember?: MemberJwtPayload,
	): Promise<HomeFeedDto> {
		try {
			this.logger.log('Query getHomeFeed');
			return this.homeService.getHomeFeed(input, currentMember?._id);
		} catch (error) {
			this.logger.error('Query getHomeFeed failed', error);
			throw error;
		}
	}
}
