import readline from 'readline';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/modules/users/user.model.js';
import { getPlanLimits } from '../src/config/plans.js';

function askPassword(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@leadnivesh.com').toLowerCase().trim();

  // Read password strictly from environment variable or interactive prompt (NEVER from argv)
  let password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (process.stdin.isTTY) {
      password = await askPassword(`Enter secure password for admin (${email}): `);
    } else {
      // eslint-disable-next-line no-console
      console.error('❌ Error: ADMIN_PASSWORD environment variable must be set in non-interactive environments.');
      process.exit(1);
    }
  }

  if (password.length < 8 || password.length > 72) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: Password must be between 8 and 72 characters (bcrypt safe limit)');
    process.exit(1);
  }

  try {
    // eslint-disable-next-line no-console
    console.log('Connecting to database...');
    await connectDB();

    const existing = await User.findOne({ email });
    const passwordHash = await bcrypt.hash(password, 12);

    if (existing) {
      existing.role = 'admin';
      existing.passwordHash = passwordHash;
      existing.isDeleted = false;
      existing.isDisabled = false;
      await existing.save();
      // eslint-disable-next-line no-console
      console.log(`✅ Updated existing user "${email}" to admin role with new password hash.`);
    } else {
      const trialEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const admin = new User({
        name: 'LeadNivesh Admin',
        email,
        passwordHash,
        phone: '+919999999999',
        role: 'admin',
        agency: {
          name: 'LeadNivesh Operations',
          city: 'Panipat',
        },
        plan: {
          tier: 'pro',
          trialEndsAt,
          limits: getPlanLimits('pro'),
        },
        consent: {
          termsAcceptedAt: new Date(),
          privacyVersion: '1.0',
        },
        sessions: [],
      });
      await admin.save();
      // eslint-disable-next-line no-console
      console.log(`✅ Created new admin user "${email}" with pro tier privileges.`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to seed admin:', err);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

seedAdmin();
