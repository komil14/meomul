import { registerEnumType } from '@nestjs/graphql';

export enum TravelStyle {
	SOLO = 'SOLO',
	FAMILY = 'FAMILY',
	COUPLE = 'COUPLE',
	FRIENDS = 'FRIENDS',
	BUSINESS = 'BUSINESS',
}

export enum BudgetLevel {
	BUDGET = 'BUDGET',
	MID = 'MID',
	PREMIUM = 'PREMIUM',
	LUXURY = 'LUXURY',
}

registerEnumType(TravelStyle, { name: 'TravelStyle' });
registerEnumType(BudgetLevel, { name: 'BudgetLevel' });
