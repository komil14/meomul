import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class DashboardStatsDto {
	// Totals
	@Field(() => Int)
	totalMembers: number;

	@Field(() => Int)
	totalHotels: number;

	@Field(() => Int)
	totalRooms: number;

	@Field(() => Int)
	totalBookings: number;

	@Field(() => Int)
	totalReviews: number;

	// Today's activity
	@Field(() => Int)
	newBookingsToday: number;

	@Field(() => Int)
	checkInsToday: number;

	@Field(() => Int)
	checkOutsToday: number;

	@Field(() => Int)
	newReviewsToday: number;

	@Field(() => Int)
	newMembersToday: number;

	// Status breakdowns
	@Field(() => Int)
	pendingHotels: number;

	@Field(() => Int)
	activeHotels: number;

	@Field(() => Int)
	pendingBookings: number;

	@Field(() => Int)
	confirmedBookings: number;

	// Revenue
	@Field(() => Int)
	totalRevenue: number;

	@Field(() => Int)
	todayRevenue: number;

	// Chat
	@Field(() => Int)
	totalChats: number;

	@Field(() => Int)
	waitingChats: number;

	@Field(() => Int)
	activeChats: number;

	// Room breakdown
	@Field(() => Int)
	availableRooms: number;

	@Field(() => Int)
	maintenanceRooms: number;

	// Notifications
	@Field(() => Int)
	totalNotifications: number;

	@Field(() => Int)
	unreadNotifications: number;
}
