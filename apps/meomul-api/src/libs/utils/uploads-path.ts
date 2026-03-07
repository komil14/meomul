import { existsSync } from 'fs';
import * as path from 'path';

export function getUploadsRoot(): string {
	const cwdUploadsPath = path.resolve(process.cwd(), 'uploads');
	if (existsSync(cwdUploadsPath)) {
		return cwdUploadsPath;
	}

	return path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads');
}
