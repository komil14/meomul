import { AppService } from './app.service';

describe('AppService', () => {
	it('returns welcome message', () => {
		const service = new AppService();
		expect(service.getHello()).toBe('Welcome to Meomul API server!');
	});
});
