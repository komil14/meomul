import {
	BadRequestException,
	Controller,
	Logger,
	Post,
	Query,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UploadGuard } from './upload.guard';
import { Messages } from '../../libs/messages';
import { VALID_TARGETS, UploadTarget, IMAGE_SIZE_LIMIT, IMAGE_MIME_TYPES, VIDEO_SIZE_LIMIT, VIDEO_MIME_TYPES } from '../../libs/config';


function createStorage(getTarget: (req: any) => string) {
	return diskStorage({
		destination: (req, _file, cb) => {
			const target = getTarget(req);
			const dir = path.join(process.cwd(), 'uploads', target);
			mkdirSync(dir, { recursive: true });
			cb(null, dir);
		},
		filename: (_req, file, cb) => {
			const ext = path.extname(file.originalname).toLowerCase();
			cb(null, `${uuidv4()}${ext}`);
		},
	});
}

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
				const target = (req.query?.target as string) ?? 'hotel';
				return VALID_TARGETS.includes(target as UploadTarget) ? target : 'hotel';
			}),
			limits: { fileSize: IMAGE_SIZE_LIMIT },
			fileFilter: (_req, file, cb) => {
				if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
					return cb(new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT), false);
				}
				cb(null, true);
			},
		}),
	)
	public uploadImage(
		@UploadedFile() file: Express.Multer.File,
		@Query('target') target: string = 'hotel',
	): { url: string } {
		if (!file) {
			throw new BadRequestException(Messages.UPLOAD_FAILED);
		}

		const safeTarget = VALID_TARGETS.includes(target as UploadTarget) ? target : 'hotel';
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
				const target = (req.query?.target as string) ?? 'hotel';
				return VALID_TARGETS.includes(target as UploadTarget) ? target : 'hotel';
			}),
			limits: { fileSize: VIDEO_SIZE_LIMIT },
			fileFilter: (_req, file, cb) => {
				if (!VIDEO_MIME_TYPES.includes(file.mimetype)) {
					return cb(
						new BadRequestException('Please provide a valid video format (mp4, mov, webm)!'),
						false,
					);
				}
				cb(null, true);
			},
		}),
	)
	public uploadVideo(
		@UploadedFile() file: Express.Multer.File,
		@Query('target') target: string = 'hotel',
	): { url: string } {
		if (!file) {
			throw new BadRequestException(Messages.UPLOAD_FAILED);
		}

		const safeTarget = VALID_TARGETS.includes(target as UploadTarget) ? target : 'hotel';
		const url = `uploads/${safeTarget}/${file.filename}`;

		this.logger.log('Video uploaded', url);
		return { url };
	}
}
