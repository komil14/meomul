import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DashboardStatsDto } from '../../libs/dto/stats/stats';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StatsService } from './stats.service';

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
export class StatsResolver {
	constructor(private readonly statsService: StatsService) {}

	@Query(() => DashboardStatsDto)
	@Roles(MemberType.ADMIN)
	public async getDashboardStats(): Promise<DashboardStatsDto> {
		console.log('Query getDashboardStats');
		return this.statsService.getDashboardStats();
	}
}
