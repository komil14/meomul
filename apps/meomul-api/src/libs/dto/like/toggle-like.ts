import { Field, ObjectType, Int } from '@nestjs/graphql';
import { LikeDto } from './like';

@ObjectType()
export class ToggleLikeDto {
	@Field(() => Boolean)
	liked: boolean;

	@Field(() => Int)
	likeCount: number;

	@Field(() => LikeDto, { nullable: true })
	like?: LikeDto;
}
