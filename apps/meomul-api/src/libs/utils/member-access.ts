import { ForbiddenException } from '@nestjs/common';
import { HostAccessStatus, MemberType } from '../enums/member.enum';
import { Messages } from '../messages';

type MemberAccessContext = {
	memberType: MemberType;
	hostAccessStatus?: HostAccessStatus;
};

export function isBackofficeOperator(memberType: MemberType): boolean {
	return memberType === MemberType.ADMIN || memberType === MemberType.ADMIN_OPERATOR;
}

export function hasApprovedHostAccess(member: MemberAccessContext): boolean {
	if (isBackofficeOperator(member.memberType)) {
		return true;
	}
	if (member.memberType !== MemberType.AGENT) {
		return false;
	}
	return (
		member.hostAccessStatus !== HostAccessStatus.PENDING &&
		member.hostAccessStatus !== HostAccessStatus.REJECTED
	);
}

export function assertApprovedHostAccess(member: MemberAccessContext): void {
	if (isBackofficeOperator(member.memberType)) {
		return;
	}
	if (
		member.memberType === MemberType.AGENT &&
		(member.hostAccessStatus === HostAccessStatus.PENDING ||
			member.hostAccessStatus === HostAccessStatus.REJECTED)
	) {
		throw new ForbiddenException('Host access is pending approval');
	}
	if (member.memberType !== MemberType.AGENT) {
		throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
	}
}
