import { AppDataSource } from '../data-source';
import { User, UserRole } from '../entities/user.entity';
import { UserSecurity } from '../entities/user-security.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Seed Admin User Script
 *
 * Creates a default admin user for the application.
 * The admin does NOT use zero-knowledge encryption since they don't store personal photos.
 *
 * Usage: npx ts-node src/database/seeds/seed-admin.ts
 *
 * Environment variables:
 * - ADMIN_EMAIL: Admin email (default: admin@aamenn.com)
 * - ADMIN_PASSWORD: Admin password (required or uses default for dev)
 */

const BCRYPT_ROUNDS = 12;

// Default admin credentials (override with env vars in production)
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aamenn.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';

async function seedAdmin() {
  console.log('🌱 Starting admin seed...');

  try {
    await AppDataSource.initialize();
    console.log('📦 Database connected');

    const userRepository = AppDataSource.getRepository(User);
    const securityRepository = AppDataSource.getRepository(UserSecurity);

    // Check if admin already exists
    const existingAdmin = await userRepository.findOne({
      where: { email: DEFAULT_ADMIN_EMAIL },
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists, updating role...');
      existingAdmin.role = UserRole.ADMIN;
      await userRepository.save(existingAdmin);
      console.log('✅ Admin role updated');
      await AppDataSource.destroy();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      DEFAULT_ADMIN_PASSWORD,
      BCRYPT_ROUNDS,
    );

    // Create admin user
    const adminUser = userRepository.create({
      email: DEFAULT_ADMIN_EMAIL,
      authProviderId: `local:${DEFAULT_ADMIN_EMAIL}`,
      passwordHash: hashedPassword,
      authProvider: 'local',
      role: UserRole.ADMIN,
      displayName: 'Administrator',
      isActive: true,
    });

    await userRepository.save(adminUser);
    console.log('👤 Admin user created');

    // Create minimal security record for admin (no real encryption needed)
    // Admin doesn't store encrypted photos, so we use placeholder values
    const adminSecurity = securityRepository.create({
      userId: adminUser.id,
      encryptedMasterKey: 'admin-no-encryption',
      kekSalt: crypto.randomBytes(32).toString('base64'),
      kdfParams: { algorithm: 'PBKDF2', iterations: 100000 },
    });

    await securityRepository.save(adminSecurity);
    console.log('🔐 Admin security record created');

    console.log('\n✅ Admin seed completed successfully!');
    console.log('📧 Email:', DEFAULT_ADMIN_EMAIL);
    console.log('🔑 Password:', DEFAULT_ADMIN_PASSWORD);
    console.log('\n⚠️  IMPORTANT: Change the admin password in production!');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedAdmin();
