import { RecommendationService } from './recommendation.service';

describe('RecommendationService', () => {
	const memberId = '699b0a1cc85a99084dbf56b1';

	const createService = (profile: unknown) => {
		const userProfileModel = {
			findOne: jest.fn().mockReturnValue({
				lean: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(profile),
				}),
			}),
		};

		const service = new RecommendationService(
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			userProfileModel as never,
			{} as never,
		);

		return { service, userProfileModel };
	};

	it('returns hasProfile=false when profile is missing', async () => {
		const { service } = createService(null);

		const result = await service.getMyRecommendationProfile(memberId);

		expect(result.hasProfile).toBe(false);
		expect(result.preferredLocations).toEqual([]);
		expect(result.preferredPurposes).toEqual([]);
	});

	it('returns hasProfile=false when required fields are incomplete', async () => {
		const { service } = createService({
			source: 'onboarding',
			preferredLocations: ['SEOUL'],
			preferredTypes: [],
			preferredPurposes: [],
			preferredAmenities: ['wifi'],
			computedAt: new Date(),
		});

		const result = await service.getMyRecommendationProfile(memberId);

		expect(result.hasProfile).toBe(false);
		expect(result.preferredLocations).toEqual(['SEOUL']);
		expect(result.preferredPurposes).toEqual([]);
	});

	it('returns hasProfile=true when required fields are complete', async () => {
		const { service } = createService({
			source: 'onboarding',
			preferredLocations: ['SEOUL'],
			preferredTypes: ['HOTEL'],
			preferredPurposes: ['SOLO'],
			preferredAmenities: ['wifi'],
			avgPriceMin: 50000,
			avgPriceMax: 120000,
			computedAt: new Date(),
		});

		const result = await service.getMyRecommendationProfile(memberId);

		expect(result.hasProfile).toBe(true);
		expect(result.preferredLocations).toEqual(['SEOUL']);
		expect(result.preferredPurposes).toEqual(['SOLO']);
		expect(result.avgPriceMin).toBe(50000);
		expect(result.avgPriceMax).toBe(120000);
	});
});
