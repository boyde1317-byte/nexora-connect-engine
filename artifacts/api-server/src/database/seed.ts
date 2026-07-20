/**
 * Nexora Connect Engine — Database Seed
 * Run: pnpm --filter @workspace/api-server run db:seed
 */
import { usersService } from '../modules/users/users.service.js';
import { disconnectDatabase } from '../infrastructure/database.js';
import { logger } from '../lib/logger.js';

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Create superadmin if not exists
    const admin = await usersService
      .createUser({
        email: 'admin@nexora.local',
        name: 'Super Admin',
        password: 'Admin@nexora123!',
        role: 'SUPER_ADMIN',
      })
      .catch((err) => {
        if (err.message?.includes('already exists')) {
          logger.info('Superadmin already exists, skipping');
          return null;
        }
        throw err;
      });

    if (admin) {
      logger.info({ userId: admin.id }, 'Superadmin created');
    }

    logger.info('Seed complete');
  } catch (err) {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
