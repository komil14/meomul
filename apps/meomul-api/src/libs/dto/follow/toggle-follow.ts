import { Field, ObjectType, Int } from '@nestjs/graphql';
import { FollowDto } from './follow';

@ObjectType()
export class ToggleFollowDto {
	@Field(() => Boolean)
	following: boolean;

	@Field(() => Int)
	followerCount: number;

	@Field(() => FollowDto, { nullable: true })
	follow?: FollowDto;
}
