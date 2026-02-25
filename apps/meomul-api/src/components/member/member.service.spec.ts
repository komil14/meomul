import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BudgetLevel, TravelStyle } from '../../libs/enums/preference.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { HotelLocation } from '../../libs/enums/hotel.enum';
import { MemberService } from './member.service';

describe('MemberService.saveOnboardingPreferences', () => {
	const memberId = '699b0a1cc85a99084dbf56b1';

	const createService = () => {
		const userProfileModel = {
			updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
		};
		const recommendationService = {
			invalidateUserCache: jest.fn().mockResolvedValue(undefined),
		};

		const service = new MemberService(
			{} as never,
			userProfileModel as never,
			{} as never,
			{} as never,
			recommendationService as never,
		);

		return { service, userProfileModel, recommendationService };
	};

	it('saves onboarding preferences and invalidates recommendation cache', async () => {
		const { service, userProfileModel, recommendationService } = createService();

		await service.saveOnboardingPreferences(
			{
				_id: memberId,
				memberType: MemberType.USER,
			} as never,
			{
				travelStyles: [TravelStyle.SOLO, TravelStyle.SOLO],
				preferredDestinations: [HotelLocation.SEOUL],
				preferredAmenities: ['wifi', 'workspace'],
				budgetLevel: BudgetLevel.MID,
			},
		);

		expect(userProfileModel.updateOne).toHaveBeenCalledTimes(1);
		const updateCall = userProfileModel.updateOne.mock.calls[0] as [
			unknown,
			{
				$set: {
					preferredLocations: HotelLocation[];
					preferredPurposes: string[];
					avgPriceMin?: number;
					avgPriceMax?: number;
					viewedHotelIds?: unknown;
					likedHotelIds?: unknown;
					bookedHotelIds?: unknown;
				};
			},
		];
		const updatePayload = updateCall[1].$set;

		expect(updatePayload.preferredLocations).toEqual([HotelLocation.SEOUL]);
		expect(updatePayload.preferredPurposes).toEqual(['SOLO']);
		expect(updatePayload.avgPriceMin).toBe(80000);
		expect(updatePayload.avgPriceMax).toBe(150000);
		expect(updatePayload.viewedHotelIds).toBeUndefined();
		expect(updatePayload.likedHotelIds).toBeUndefined();
		expect(updatePayload.bookedHotelIds).toBeUndefined();

		expect(recommendationService.invalidateUserCache).toHaveBeenCalledTimes(1);
		expect(recommendationService.invalidateUserCache).toHaveBeenCalledWith(memberId);
	});

	it('rejects empty travel styles', async () => {
		const { service } = createService();

		await expect(
			service.saveOnboardingPreferences(
				{
					_id: memberId,
					memberType: MemberType.USER,
				} as never,
				{
					travelStyles: [],
					preferredDestinations: [HotelLocation.SEOUL],
					preferredAmenities: [],
				},
			),
		).rejects.toThrow(BadRequestException);
	});

	it('rejects empty preferred destinations', async () => {
		const { service } = createService();

		await expect(
			service.saveOnboardingPreferences(
				{
					_id: memberId,
					memberType: MemberType.USER,
				} as never,
				{
					travelStyles: [TravelStyle.BUSINESS],
					preferredDestinations: [],
					preferredAmenities: [],
				},
			),
		).rejects.toThrow(BadRequestException);
	});

	it('rejects non-user roles', async () => {
		const { service } = createService();

		await expect(
			service.saveOnboardingPreferences(
				{
					_id: memberId,
					memberType: MemberType.AGENT,
				} as never,
				{
					travelStyles: [TravelStyle.BUSINESS],
					preferredDestinations: [HotelLocation.SEOUL],
					preferredAmenities: [],
				},
			),
		).rejects.toThrow(ForbiddenException);
	});
});
