import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards, Logger } from '@nestjs/common';
import { DashboardStatsDto } from '../../libs/dto/stats/stats';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StatsService } from './stats.service';

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
export class StatsResolver {
	private readonly logger = new Logger(StatsResolver.name);

	constructor(private readonly statsService: StatsService) {}

	@Query(() => DashboardStatsDto)
	@Roles(MemberType.ADMIN)
	public async getDashboardStats(): Promise<DashboardStatsDto> {
		this.logger.log('Query getDashboardStats');
		return this.statsService.getDashboardStats();
	}
}
