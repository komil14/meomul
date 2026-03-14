import { Field, ObjectType } from '@nestjs/graphql';
import { HostApplicationStatus } from '../../enums/member.enum';
import { StayPurpose } from '../../enums/common.enum';
import { HotelLocation, HotelType } from '../../enums/hotel.enum';

@ObjectType()
export class HostApplicationDto {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	applicantMemberId: string;

	@Field(() => String, { nullable: true })
	applicantMemberNick?: string;

	@Field(() => String)
	businessName: string;

	@Field(() => String)
	businessDescription: string;

	@Field(() => String, { nullable: true })
	contactPhone?: string;

	@Field(() => String, { nullable: true })
	businessEmail?: string;

	@Field(() => String, { nullable: true })
	intendedHotelName?: string;

	@Field(() => HotelLocation, { nullable: true })
	intendedHotelLocation?: HotelLocation;

	@Field(() => HotelType)
	hotelType: HotelType;

	@Field(() => [StayPurpose], { defaultValue: [] })
	suitableFor: StayPurpose[];

	@Field(() => String, { nullable: true })
	notes?: string;

	@Field(() => HostApplicationStatus)
	status: HostApplicationStatus;

	@Field(() => String, { nullable: true })
	reviewedByMemberId?: string;

	@Field(() => String, { nullable: true })
	reviewedByMemberNick?: string;

	@Field(() => String, { nullable: true })
	reviewNote?: string;

	@Field(() => Date, { nullable: true })
	reviewedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}
