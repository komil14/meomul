import { RecommendationService } from './recommendation.service';

describe('RecommendationService', () => {
	const memberId = '699b0a1cc85a99084dbf56b1';
	const toObjectId = (seed: string): string => {
		const normalized = seed.toLowerCase().replace(/[^a-f0-9]/g, 'a');
		return `${normalized}${'0'.repeat(24)}`.slice(0, 24);
	};
	type SpyAccess = {
		getRecommendationCacheVersion: (memberId: string) => Promise<string>;
		buildUserProfile: (memberId: string) => Promise<unknown>;
		runRecommendationStage: (...args: unknown[]) => Promise<{
			hotels: unknown[];
			fallbackCount: number;
			matchedLocationCount: number;
		}>;
		getTopRatedFallbackHotels: (...args: unknown[]) => Promise<unknown[]>;
	};

	const createHotel = (id: string, location: string) =>
		({
			_id: toObjectId(id),
			hotelTitle: `Hotel ${id}`,
			hotelLocation: location,
			hotelType: 'HOTEL',
			hotelRating: 4.8,
			hotelLikes: 10,
			hotelImages: [],
		}) as never;

	const createService = (profile: unknown = null) => {
		const cacheManager = {
			get: jest.fn().mockResolvedValue(null),
			set: jest.fn().mockResolvedValue(undefined),
			del: jest.fn().mockResolvedValue(undefined),
		};

		const userProfileModel = {
			findOne: jest.fn().mockReturnValue({
				lean: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(profile),
				}),
			}),
		};

		const service = new RecommendationService(
			cacheManager as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			userProfileModel as never,
			{} as never,
		);

		return { service, cacheManager, userProfileModel };
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

	it('builds staged recommendations with metadata and global fallback', async () => {
		const { service, cacheManager } = createService();
		const spyAccess = service as unknown as SpyAccess;

		jest.spyOn(spyAccess, 'getRecommendationCacheVersion').mockResolvedValue('v-stage');
		jest.spyOn(spyAccess, 'buildUserProfile').mockResolvedValue({
			preferredLocations: ['SEOUL'],
			preferredTypes: ['HOTEL'],
			preferredPurposes: ['SOLO'],
			preferredAmenities: ['wifi'],
			avgPriceMin: 50000,
			avgPriceMax: 200000,
			viewedHotelIds: [],
			likedHotelIds: [],
			bookedHotelIds: [],
			profileSource: 'onboarding',
			behaviorMaturity: 0.2,
		});

		jest
			.spyOn(spyAccess, 'runRecommendationStage')
			.mockResolvedValueOnce({
				hotels: [createHotel('h-strict', 'SEOUL')],
				fallbackCount: 0,
				matchedLocationCount: 1,
			})
			.mockResolvedValueOnce({
				hotels: [createHotel('h-relaxed', 'SEOUL')],
				fallbackCount: 0,
				matchedLocationCount: 1,
			})
			.mockResolvedValueOnce({
				hotels: [createHotel('h-general', 'BUSAN')],
				fallbackCount: 0,
				matchedLocationCount: 0,
			});

		jest.spyOn(spyAccess, 'getTopRatedFallbackHotels').mockResolvedValue([createHotel('h-fallback', 'JEJU')]);

		const result = await service.getRecommendedHotelsV2(memberId, 4);

		expect(result.list).toHaveLength(4);
		expect(result.meta.profileSource).toBe('onboarding');
		expect(result.meta.strictStageCount).toBe(1);
		expect(result.meta.relaxedStageCount).toBe(1);
		expect(result.meta.generalStageCount).toBe(1);
		expect(result.meta.fallbackCount).toBe(1);
		expect(result.meta.matchedLocationCount).toBe(2);
		expect(result.explanations).toHaveLength(4);
		expect(cacheManager.set).toHaveBeenCalledWith(
			expect.stringContaining(`rec:${memberId}:v-stage:algo-4:4`),
			result,
			600000,
		);
	});

	it('returns cached V2 recommendations without recomputing profile', async () => {
		const { service, cacheManager } = createService();
		const spyAccess = service as unknown as SpyAccess;
		const cachedPayload = {
			list: [createHotel('h-cached', 'SEOUL')],
			meta: {
				profileSource: 'onboarding' as const,
				onboardingWeight: 0.7,
				behaviorWeight: 0.3,
				matchedLocationCount: 1,
				fallbackCount: 0,
				strictStageCount: 1,
				relaxedStageCount: 0,
				generalStageCount: 0,
			},
			explanations: [],
		};

		cacheManager.get.mockImplementation((key: string) => {
			if (key === `rec:v:${memberId}`) {
				return 'v-cache';
			}
			if (key === `rec:${memberId}:v-cache:algo-4:3`) {
				return cachedPayload;
			}
			return null;
		});

		const buildUserProfileSpy = jest.spyOn(spyAccess, 'buildUserProfile');

		const result = await service.getRecommendedHotelsV2(memberId, 3);

		expect(result).toEqual(cachedPayload);
		expect(buildUserProfileSpy).not.toHaveBeenCalled();
	});

	it('invalidates recommendation cache version and legacy keys', async () => {
		const { service, cacheManager } = createService();

		await service.invalidateUserCache(memberId);

		expect(cacheManager.set).toHaveBeenCalledWith(`rec:v:${memberId}`, expect.any(String), 604800000);
		expect(cacheManager.del).toHaveBeenCalledWith(`rec:${memberId}:10`);
		expect(cacheManager.del).toHaveBeenCalledWith(`rec:${memberId}:20`);
	});
});
