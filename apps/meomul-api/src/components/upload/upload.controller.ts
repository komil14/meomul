import {
	BadRequestException,
	Controller,
	ForbiddenException,
	Logger,
	Post,
	Query,
	Req,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { UploadGuard } from './upload.guard';
import { Messages } from '../../libs/messages';
import {
	VALID_TARGETS,
	UploadTarget,
	IMAGE_SIZE_LIMIT,
	IMAGE_MIME_TYPES,
	VIDEO_SIZE_LIMIT,
	VIDEO_MIME_TYPES,
	MIME_TO_EXTENSIONS,
} from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import type { MemberJwtPayload } from '../../libs/types/member';
import { assertApprovedHostAccess } from '../../libs/utils/member-access';
import { getUploadsRoot } from '../../libs/utils/uploads-path';

type UploadRequest = Request & {
	query: Request['query'] & { target?: string };
	member?: MemberJwtPayload;
};

function createStorage(getTarget: (req: UploadRequest) => string) {
	return diskStorage({
		destination: (req, _file, cb) => {
			const target = getTarget(req as UploadRequest);
			if (!VALID_TARGETS.includes(target as UploadTarget)) {
				return cb(new BadRequestException('Invalid upload target'), '');
			}
			const dir = path.join(getUploadsRoot(), target);
			mkdirSync(dir, { recursive: true });
			cb(null, dir);
		},
		filename: (_req, file, cb) => {
			const ext = path.extname(file.originalname).toLowerCase();
			cb(null, `${uuidv4()}${ext}`);
		},
	});
}

const TARGET_PERMISSIONS: Record<UploadTarget, MemberType[]> = {
	member: [MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
	hotel: [MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
	room: [MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
	review: [MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
	refund: [MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
	chat: [MemberType.USER, MemberType.AGENT, MemberType.ADMIN, MemberType.ADMIN_OPERATOR],
};

@Controller('upload')
@UseGuards(UploadGuard)
export class UploadController {
	private readonly logger = new Logger(UploadController.name);

	/**
	 * Upload a single image (jpg, jpeg, png, webp) — max 5MB
	 *
	 * POST /upload/image?target=hotel
	 * Header: Authorization: Bearer <token>
	 * Body: form-data, field name = "file"
	 *
	 * Returns: { url: "uploads/hotel/<uuid>.jpg" }
	 */
	@Post('image')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: createStorage((req) => {
				return req.query.target ?? 'hotel';
			}),
			limits: { fileSize: IMAGE_SIZE_LIMIT },
			fileFilter: (_req, file, cb) => {
				if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
					return cb(new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT), false);
				}
				const ext = path.extname(file.originalname).toLowerCase();
				const allowedExts = MIME_TO_EXTENSIONS[file.mimetype];
				if (allowedExts && !allowedExts.includes(ext)) {
					return cb(new BadRequestException('File extension does not match its content type'), false);
				}
				cb(null, true);
			},
		}),
	)
	public uploadImage(
		@UploadedFile() file: Express.Multer.File,
		@Req() req: UploadRequest,
		@Query('target') target: string = 'hotel',
	): { url: string } {
		if (!file) {
			throw new BadRequestException(Messages.UPLOAD_FAILED);
		}

		const safeTarget = this.validateUploadTarget(target);
		this.assertTargetPermission(req, safeTarget);
		const url = `uploads/${safeTarget}/${file.filename}`;

		this.logger.log('Image uploaded', url);
		return { url };
	}

	/**
	 * Upload a single video (mp4, mov, webm) — max 50MB
	 *
	 * POST /upload/video?target=hotel
	 * Header: Authorization: Bearer <token>
	 * Body: form-data, field name = "file"
	 *
	 * Returns: { url: "uploads/hotel/<uuid>.mp4" }
	 */
	@Post('video')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: createStorage((req) => {
				return req.query.target ?? 'hotel';
			}),
			limits: { fileSize: VIDEO_SIZE_LIMIT },
			fileFilter: (_req, file, cb) => {
				if (!VIDEO_MIME_TYPES.includes(file.mimetype)) {
					return cb(new BadRequestException('Please provide a valid video format (mp4, mov, webm)!'), false);
				}
				const ext = path.extname(file.originalname).toLowerCase();
				const allowedExts = MIME_TO_EXTENSIONS[file.mimetype];
				if (allowedExts && !allowedExts.includes(ext)) {
					return cb(new BadRequestException('File extension does not match its content type'), false);
				}
				cb(null, true);
			},
		}),
	)
	public uploadVideo(
		@UploadedFile() file: Express.Multer.File,
		@Req() req: UploadRequest,
		@Query('target') target: string = 'hotel',
	): { url: string } {
		if (!file) {
			throw new BadRequestException(Messages.UPLOAD_FAILED);
		}

		const safeTarget = this.validateUploadTarget(target);
		this.assertTargetPermission(req, safeTarget);
		const url = `uploads/${safeTarget}/${file.filename}`;

		this.logger.log('Video uploaded', url);
		return { url };
	}

	private validateUploadTarget(target: string): UploadTarget {
		if (!VALID_TARGETS.includes(target as UploadTarget)) {
			throw new BadRequestException('Invalid upload target');
		}
		return target as UploadTarget;
	}

	private assertTargetPermission(req: UploadRequest, target: UploadTarget): void {
		const memberType = req.member?.memberType;
		if (!memberType) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const allowedRoles = TARGET_PERMISSIONS[target];
		if (!allowedRoles.includes(memberType)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
		if (
			req.member?.memberType === MemberType.AGENT &&
			(target === 'hotel' || target === 'room')
		) {
			assertApprovedHostAccess(req.member);
		}
	}
}
