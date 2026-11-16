import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { LocalityAlias } from '../src/modules/aliases/alias.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { Inquiry } from '../src/modules/inquiries/inquiry.model.js';
import { ContactLead } from '../src/modules/contact/contactLead.model.js';
import { getPlanLimits } from '../src/config/plans.js';
import { cryptoService } from '../src/utils/crypto.js';

async function seed() {
  console.log('🚀 Connecting to MongoDB Atlas...');
  await connectDB();
  console.log('✅ Connected to MongoDB Atlas cluster:', mongoose.connection.host);

  // 1. Sync Indexes across all collections
  console.log('⚡ Ensuring indexes on all collections...');
  await Promise.all([
    User.syncIndexes(),
    Property.syncIndexes(),
    Buyer.syncIndexes(),
    Deal.syncIndexes(),
    LocalityAlias.syncIndexes(),
    ShareLink.syncIndexes(),
    Inquiry.syncIndexes(),
    ContactLead.syncIndexes(),
  ]);
  console.log('✅ All MongoDB indexes synchronized successfully.');

  // 2. Global Panipat Locality Aliases
  console.log('📍 Seeding Panipat Locality Aliases...');
  const panipatLocalities = [
    { canonical: 'Sector 11', canonicalKey: 'sector-11', aliases: ['sec 11', 'sec-11', 's11', 'sector11'] },
    { canonical: 'Sector 12', canonicalKey: 'sector-12', aliases: ['sec 12', 'sec-12', 's12', 'sector12'] },
    { canonical: 'Sector 13-17', canonicalKey: 'sector-13-17', aliases: ['sec 13-17', '13-17', 'sector 13 17'] },
    { canonical: 'Sector 18', canonicalKey: 'sector-18', aliases: ['sec 18', 'sec-18', 's18', 'huda sector 18'] },
    { canonical: 'Sector 25', canonicalKey: 'sector-25', aliases: ['sec 25', 'sec-25', 'transport nagar'] },
    { canonical: 'Model Town', canonicalKey: 'model-town', aliases: ['model town', 'mt', 'modeltown'] },
    { canonical: 'Ansals Sushant City', canonicalKey: 'ansals-sushant-city', aliases: ['ansal', 'sushant city', 'ansals'] },
    { canonical: 'Eldeco Estate One', canonicalKey: 'eldeco-estate-one', aliases: ['eldeco', 'estate one', 'eldeco panipat'] },
    { canonical: 'Barsat Road', canonicalKey: 'barsat-road', aliases: ['barsat rd', 'barsat road'] },
    { canonical: 'GT Road', canonicalKey: 'gt-road', aliases: ['g.t. road', 'gt karnal road', 'nh44'] },
    { canonical: 'Tehsil Camp', canonicalKey: 'tehsil-camp', aliases: ['tehsil', 'camp', 'tehsil camp'] },
    { canonical: 'Chandni Bagh', canonicalKey: 'chandni-bagh', aliases: ['chandni bagh', 'chandni chowk panipat'] },
  ];

  for (const loc of panipatLocalities) {
    await LocalityAlias.findOneAndUpdate(
      { canonicalKey: loc.canonicalKey, userId: null },
      {
        city: 'Panipat',
        canonical: loc.canonical,
        canonicalKey: loc.canonicalKey,
        aliases: loc.aliases,
        isDeleted: false,
      },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log(`✅ Seeded ${panipatLocalities.length} Panipat locality aliases.`);

  // 3. Admin Account
  const adminEmail = 'admin@leadnivesh.com';
  const adminPass = 'Admin@123456';
  const adminHash = await bcrypt.hash(adminPass, 12);
  const adminUser = await User.findOneAndUpdate(
    { email: adminEmail },
    {
      name: 'LeadNivesh SuperAdmin',
      email: adminEmail,
      passwordHash: adminHash,
      phone: '+919999900001',
      role: 'admin',
      plan: {
        tier: 'pro',
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limits: getPlanLimits('pro'),
      },
      isDeleted: false,
      isDisabled: false,
      consent: {
        termsAcceptedAt: new Date(),
        privacyVersion: '1.0',
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(`✅ Admin account ready: ${adminEmail}`);

  // 4. Broker Account
  const brokerEmail = 'broker@leadnivesh.com';
  const brokerPass = 'Broker@123456';
  const brokerHash = await bcrypt.hash(brokerPass, 12);
  const brokerUser = await User.findOneAndUpdate(
    { email: brokerEmail },
    {
      name: 'Vikram Malhotra',
      email: brokerEmail,
      passwordHash: brokerHash,
      phone: '+919876543210',
      role: 'user',
      plan: {
        tier: 'pro',
        trialEndsAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        limits: getPlanLimits('pro'),
      },
      agency: {
        name: 'Malhotra Real Estate & Associates',
        city: 'Panipat',
        reraNo: 'HRERA-PKL-PNP-2023-089',
      },
      branding: {
        companyName: 'Malhotra Real Estate',
        primaryColor: '#0F766E',
      },
      isDeleted: false,
      isDisabled: false,
      consent: {
        termsAcceptedAt: new Date(),
        privacyVersion: '1.0',
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(`✅ Broker account ready: ${brokerEmail}`);

  const brokerId = brokerUser._id;

  // 5. Sample Properties for Broker
  const sampleProperties = [
    {
      userId: brokerId,
      title: '250 Gaj Corner Plot in Sector 12',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Sector 12',
      localityKey: 'sector-12',
      city: 'Panipat',
      landmark: 'Near Mittal Mega Mall',
      size: { value: 250, unit: 'gaj' },
      sizeGaj: 250,
      priceDemandPaise: 850000000, // ₹85 Lakh
      facing: 'North-East',
      description: 'Prime 2-side open residential corner plot on 12-meter wide road. Clear registry title.',
      tags: ['corner', 'registry', 'prime-location'],
      owner: {
        name: 'Suresh Kumar Aggarwal',
        phone: '+919812001122',
        notes: 'Owner is in Delhi, demands 10% token and 45 days agreement time.',
      },
      status: 'available',
      source: 'manual',
    },
    {
      userId: brokerId,
      title: '350 Gaj Luxury Built Kothi in Model Town',
      type: 'Kothi',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Model Town',
      localityKey: 'model-town',
      city: 'Panipat',
      landmark: 'Near Shivaji Stadium',
      size: { value: 350, unit: 'gaj' },
      sizeGaj: 350,
      priceDemandPaise: 3250000000, // ₹3.25 Cr
      facing: 'East',
      description: 'Newly constructed double-storey luxury kothi with Italian marble, lift provision, modular kitchen, and 3-car parking.',
      tags: ['luxury', 'lift', 'ready-to-move'],
      owner: {
        name: 'Ramesh Chander Chhabra',
        phone: '+919896112233',
        notes: 'Urgent sale due to relocation to Canada.',
      },
      status: 'available',
      source: 'manual',
    },
    {
      userId: brokerId,
      title: '150 Gaj 3BHK Builder Floor in Sector 11',
      type: 'Floor',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Sector 11',
      localityKey: 'sector-11',
      city: 'Panipat',
      landmark: 'Near Arya Bal Bharti School',
      size: { value: 150, unit: 'gaj' },
      sizeGaj: 150,
      priceDemandPaise: 580000000, // ₹58 Lakh
      facing: 'North',
      description: 'Second floor with roof rights, reserved stilt parking, complete woodwork, and 3 attached washrooms.',
      tags: ['roof-rights', 'stilt-parking', 'semi-furnished'],
      owner: {
        name: 'Mohit Jindal',
        phone: '+919812445566',
        notes: 'Price slightly negotiable for immediate payment.',
      },
      status: 'available',
      source: 'manual',
    },
    {
      userId: brokerId,
      title: '400 Sqft Main Market Commercial Shop in GT Road',
      type: 'Shop',
      category: 'Commercial',
      purpose: 'Sale',
      locality: 'GT Road',
      localityKey: 'gt-road',
      city: 'Panipat',
      landmark: 'Opposite Sanjay Chowk',
      size: { value: 400, unit: 'sqft' },
      sizeGaj: 44.44,
      priceDemandPaise: 1200000000, // ₹1.2 Cr
      facing: 'West',
      description: 'High footfall ground floor commercial shop with 18ft frontage. Ideal for electronics or jewelry brand.',
      tags: ['ground-floor', 'high-footfall', 'commercial'],
      owner: {
        name: 'Jagdish Rai Arora',
        phone: '+919896778899',
        notes: 'Currently rented at 45k/month. Good rental yield.',
      },
      status: 'available',
      source: 'manual',
    },
  ];

  const createdProperties = [];
  for (const p of sampleProperties) {
    const prop = await Property.findOneAndUpdate(
      { userId: brokerId, title: p.title },
      p,
      { upsert: true, returnDocument: 'after' }
    );
    createdProperties.push(prop);
  }
  console.log(`✅ Seeded ${createdProperties.length} active property listings for broker.`);

  // 6. Sample Buyers
  const sampleBuyers = [
    {
      userId: brokerId,
      name: 'Sunil Grover',
      phone: '+919812998877',
      types: ['Plot'],
      purpose: 'Sale',
      budget: { minPaise: 700000000, maxPaise: 950000000 }, // ₹70L - ₹95L
      sizeGaj: { min: 200, max: 300 },
      localities: [{ display: 'Sector 12', key: 'sector-12' }],
      urgency: 'hot',
      status: 'active',
      notes: 'Ready buyer with approved SBI home loan looking for immediate registry plot.',
    },
    {
      userId: brokerId,
      name: 'Harpreet Singh Sethi',
      phone: '+919876110022',
      types: ['Kothi'],
      purpose: 'Sale',
      budget: { minPaise: 2500000000, maxPaise: 3500000000 }, // ₹2.5Cr - ₹3.5Cr
      sizeGaj: { min: 300, max: 400 },
      localities: [{ display: 'Model Town', key: 'model-town' }],
      urgency: 'warm',
      status: 'active',
      notes: 'Industrialist from Panipat textile belt looking for premium bungalow.',
    },
    {
      userId: brokerId,
      name: 'Deepak Verma',
      phone: '+919812556677',
      types: ['Floor'],
      purpose: 'Sale',
      budget: { minPaise: 500000000, maxPaise: 650000000 }, // ₹50L - ₹65L
      sizeGaj: { min: 140, max: 180 },
      localities: [{ display: 'Sector 11', key: 'sector-11' }],
      urgency: 'hot',
      status: 'active',
      notes: 'Wants builder floor with roof rights for family.',
    },
  ];

  const createdBuyers = [];
  for (const b of sampleBuyers) {
    const buyer = await Buyer.findOneAndUpdate(
      { userId: brokerId, name: b.name },
      b,
      { upsert: true, returnDocument: 'after' }
    );
    createdBuyers.push(buyer);
  }
  console.log(`✅ Seeded ${createdBuyers.length} active buyer requirements.`);

  // 7. Sample Deals in Pipeline
  if (createdBuyers.length > 0 && createdProperties.length > 0) {
    const deal1 = await Deal.findOneAndUpdate(
      { userId: brokerId, buyerId: createdBuyers[0]._id, propertyId: createdProperties[0]._id },
      {
        userId: brokerId,
        buyerId: createdBuyers[0]._id,
        propertyId: createdProperties[0]._id,
        propertyTitleSnapshot: createdProperties[0].title,
        valuePaise: 820000000, // ₹82L negotiated
        commission: {
          mode: 'percent',
          bps: 100, // 1%
          expectedPaise: 820000, // ₹82,000
        },
        stage: 'negotiating',
        stageHistory: [
          { stage: 'interested', at: new Date(Date.now() - 5 * 86400000) },
          { stage: 'shown', at: new Date(Date.now() - 3 * 86400000) },
          { stage: 'negotiating', at: new Date() },
        ],
        payments: [],
        notes: 'Buyer offered ₹80 Lakh; owner agreed at ₹82 Lakh. Drafting token paperwork.',
        isDeleted: false,
      },
      { upsert: true, returnDocument: 'after' }
    );

    const deal2 = await Deal.findOneAndUpdate(
      { userId: brokerId, buyerId: createdBuyers[1]._id, propertyId: createdProperties[1]._id },
      {
        userId: brokerId,
        buyerId: createdBuyers[1]._id,
        propertyId: createdProperties[1]._id,
        propertyTitleSnapshot: createdProperties[1].title,
        valuePaise: 3150000000, // ₹3.15 Cr
        commission: {
          mode: 'percent',
          bps: 100,
          expectedPaise: 3150000, // ₹3,15,000
        },
        stage: 'finalized',
        stageHistory: [
          { stage: 'interested', at: new Date(Date.now() - 10 * 86400000) },
          { stage: 'shown', at: new Date(Date.now() - 7 * 86400000) },
          { stage: 'negotiating', at: new Date(Date.now() - 3 * 86400000) },
          { stage: 'finalized', at: new Date() },
        ],
        payments: [
          { amountPaise: 10000000, receivedAt: new Date(Date.now() - 1 * 86400000), note: 'Initial booking advance received via cheque' },
        ],
        notes: 'Token received! Agreement scheduled for next Monday.',
        isDeleted: false,
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('✅ Seeded 2 deals in negotiating and finalized stages.');
  }

  // 8. Sample Public Share Link
  const shareToken = 'model-town-luxury-kothi-panipat';
  await ShareLink.findOneAndUpdate(
    { propertyId: createdProperties[1]._id },
    {
      userId: brokerId,
      propertyId: createdProperties[1]._id,
      token: shareToken,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      isRevoked: false,
      viewCount: 18,
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(`✅ Seeded public share link: /p/${shareToken}`);

  // 9. Sample Landing Page Leads
  await ContactLead.findOneAndUpdate(
    { phoneE164: '+919812990011' },
    {
      name: 'Anil Singla',
      email: 'anil.singla@gmail.com',
      phone: '9812990011',
      phoneE164: '+919812990011',
      message: 'Looking for 500 sq yard industrial plot near Sector 25 Panipat.',
      city: 'Panipat',
      agencyName: 'Singla TexFab',
      ipHash: 'demo_seed_ip_hash_01',
      createdAt: new Date(),
    },
    { upsert: true, returnDocument: 'after' }
  );

  await ContactLead.findOneAndUpdate(
    { phoneE164: '+919896443322' },
    {
      name: 'Gaurav Narang',
      email: 'gaurav.narang@yahoo.com',
      phone: '9896443322',
      phoneE164: '+919896443322',
      message: 'Want to partner as an enterprise broker agency in Haryana.',
      city: 'Panipat',
      agencyName: 'Narang Properties',
      ipHash: 'demo_seed_ip_hash_02',
      createdAt: new Date(),
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log('✅ Seeded 2 landing page contact leads.');

  // Print Collection Counts
  console.log('\n📊 DATABASE SUMMARY IN MONGODB ATLAS:');
  console.log('-------------------------------------------');
  console.log('  Users:', await User.countDocuments());
  console.log('  Properties:', await Property.countDocuments());
  console.log('  Buyers:', await Buyer.countDocuments());
  console.log('  Deals:', await Deal.countDocuments());
  console.log('  Locality Aliases:', await LocalityAlias.countDocuments());
  console.log('  Share Links:', await ShareLink.countDocuments());
  console.log('  Contact Leads:', await ContactLead.countDocuments());
  console.log('-------------------------------------------');
  console.log('🎉 ALL DATA UPDATED AND SEEDED IN ATLAS DATABASE!');

  await disconnectDB();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
